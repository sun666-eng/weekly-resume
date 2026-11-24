import type { LanguageModel } from "ai";
import type { SystemAiConfig, SystemAiEndpoint } from "./system-config";
import { ORPCError } from "@orpc/client";
import { APICallError, RetryError } from "ai";
import { ZodError } from "zod";
import { isDirectDeepSeekProvider } from "./capabilities";
import { publicSystemAiText } from "./system-config";

export type AiCallOptions = { abortSignal?: AbortSignal; maxRetries?: number };
type Route = "parseText" | "parsePdf" | "parseDocx" | "atsReview" | "agent.generate" | "agent.stream";
const cooldowns = new Map<string, number>();

export function resetSystemAiCooldowns() {
	cooldowns.clear();
}

function candidates(config: SystemAiConfig, now: number) {
	for (const [key, until] of cooldowns) {
		if (until <= now) cooldowns.delete(key);
	}
	const directCount = config.endpoints.filter(isDirectDeepSeekProvider).length;
	let directIndex = 0;
	let relayIndex = directCount;
	const all = config.endpoints.map((endpoint, index) => {
		const direct = isDirectDeepSeekProvider(endpoint);
		// Number circuits in Agent order so imports share the same cooldowns in their original order.
		const circuitIndex = direct ? directIndex++ : relayIndex++;
		return {
			endpoint,
			key: `${circuitIndex}:${endpoint.provider}:${endpoint.baseURL ?? ""}:${endpoint.model}`,
			relay: directCount > 0 ? !direct : index < config.endpoints.length - 1,
		};
	});
	const ready = all.filter(({ key }) => !cooldowns.has(key));
	if (ready.length) return ready;
	if (directCount === 0) return [...all.slice(-1), ...all.slice(0, -1)];
	return [...all.filter(({ relay }) => !relay), ...all.filter(({ relay }) => relay)];
}

// Some provider operations ignore abort until they have opened a connection. Bound the wait as well as the I/O.
async function untilAborted<T>(signal: AbortSignal | undefined, call: () => PromiseLike<T>): Promise<T> {
	if (!signal) return call();
	signal.throwIfAborted();
	let onAbort: (() => void) | undefined;
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		const pending = Promise.resolve().then(() => {
			signal.throwIfAborted();
			return call();
		});
		return await Promise.race([aborted, pending]);
	} finally {
		if (onAbort) signal.removeEventListener("abort", onAbort);
	}
}

function failureDetails(error: unknown, timedOut: boolean) {
	const cause = RetryError.isInstance(error) ? error.lastError : error;
	const statusCode = APICallError.isInstance(cause) && typeof cause.statusCode === "number" ? cause.statusCode : null;
	if (timedOut) return { statusCode, reason: "timeout" };
	if (statusCode !== null) return { statusCode, reason: "http_error" };
	if (
		cause instanceof SyntaxError ||
		cause instanceof ZodError ||
		(cause instanceof ORPCError && cause.code === "AI_RESPONSE_INVALID")
	) {
		return { statusCode, reason: "invalid_response" };
	}
	return { statusCode, reason: "upstream_error" };
}

export async function runWithSystemAiFailover<T>(
	config: SystemAiConfig,
	route: Route,
	abortSignal: AbortSignal | undefined,
	run: (endpoint: SystemAiEndpoint, options: AiCallOptions, recordFailure: (error: unknown) => void) => PromiseLike<T>,
	now: () => number = Date.now,
): Promise<T> {
	abortSignal?.throwIfAborted();
	const routes = candidates(config, now());
	let lastError: unknown;
	for (const [attempt, { endpoint, key, relay }] of routes.entries()) {
		abortSignal?.throwIfAborted();
		const timeoutMs = endpoint.timeoutMs ?? (relay ? config.defaultRelayTimeoutMs : undefined);
		const timeout = timeoutMs === undefined ? undefined : new AbortController();
		const timer =
			timeout &&
			setTimeout(() => timeout.abort(new DOMException("System AI endpoint timed out", "TimeoutError")), timeoutMs);
		const signal =
			timeout && abortSignal ? AbortSignal.any([abortSignal, timeout.signal]) : (timeout?.signal ?? abortSignal);
		let failed = false;
		const recordFailure = (error: unknown) => {
			if (failed || abortSignal?.aborted) return;
			failed = true;
			cooldowns.set(key, now() + config.cooldownMs);
			console.warn(
				JSON.stringify({
					evt: "system_ai.fallback",
					route,
					provider: endpoint.provider,
					model: publicSystemAiText(endpoint.model, config.endpoints),
					attempt: attempt + 1,
					total: routes.length,
					...failureDetails(error, !!timeout?.signal.aborted),
				}),
			);
		};
		try {
			const result = await untilAborted(signal, () =>
				run(endpoint, { ...(signal && { abortSignal: signal }), ...(relay ? { maxRetries: 0 } : {}) }, recordFailure),
			);
			signal?.throwIfAborted();
			cooldowns.delete(key);
			return result;
		} catch (error) {
			abortSignal?.throwIfAborted();
			lastError = error;
			recordFailure(error);
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastError;
}

const outputTypes = new Set([
	"tool-call",
	"tool-input-start",
	"tool-input-delta",
	"tool-result",
	"tool-error",
	"tool-approval-request",
	"tool-approval-response",
	"tool-output-denied",
	"file",
	"reasoning-file",
	"source",
	"custom",
	"finish",
]);

export function isSystemAiOutput(part: { type: string; delta?: string; text?: string }) {
	if (part.type === "text-delta" || part.type === "reasoning-delta") return Boolean(part.delta ?? part.text);
	return outputTypes.has(part.type);
}

type StreamPart = { type: string; delta?: string; error?: unknown };
type StreamResult<Part> = {
	stream: ReadableStream<Part>;
	request?: { body?: unknown };
	response?: { headers?: Record<string, string> };
};

async function probeStream<Part extends StreamPart>(
	result: StreamResult<Part>,
	signal: AbortSignal | undefined,
	recordFailure: (error: unknown) => void,
): Promise<StreamResult<Part>> {
	const reader = result.stream.getReader();
	const prefix: Part[] = [];
	let downstream: ReadableStreamDefaultController<Part> | undefined;
	let canceled = false;
	const release = () => {
		signal?.removeEventListener("abort", onAbort);
		reader.releaseLock();
	};
	const cancel = (reason?: unknown) => {
		canceled = true;
		const pending = reader.cancel(reason);
		release();
		return pending;
	};
	const onAbort = () => {
		downstream?.error(signal?.reason);
		void cancel(signal?.reason).catch(() => undefined);
	};
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		for (;;) {
			signal?.throwIfAborted();
			const { value, done } = await reader.read();
			signal?.throwIfAborted();
			if (done) throw new Error("System AI stream ended before its first output.");
			if (value.type === "error") throw value.error ?? new Error("System AI stream failed before its first output.");
			prefix.push(value);
			if (isSystemAiOutput(value)) break;
		}
	} catch (error) {
		void cancel().catch(() => undefined);
		throw error;
	}

	// Deliver the entire committed prefix before reading again, even if the next read fails immediately.
	return {
		...result,
		stream: new ReadableStream<Part>(
			{
				start(controller) {
					downstream = controller;
					for (const part of prefix) controller.enqueue(part);
				},
				async pull(controller) {
					try {
						const { value, done } = await reader.read();
						if (!done) {
							if (value.type === "error") recordFailure(value.error);
							controller.enqueue(value);
							return;
						}
						controller.close();
					} catch (error) {
						if (!canceled) recordFailure(error);
						controller.error(error);
					}
					release();
				},
				cancel,
			},
			{ highWaterMark: 0 },
		),
	};
}

// V3 and V4 share this transport contract. Keep the native SDK version, including its typed file/tool parts.
type SdkModel<V extends "v3" | "v4"> = Extract<LanguageModel, { specificationVersion: V }>;
export function createFallbackLanguageModel(
	config: SystemAiConfig,
	version: "v3",
	modelFor: (endpoint: SystemAiEndpoint) => SdkModel<"v3">,
): SdkModel<"v3">;
export function createFallbackLanguageModel(
	config: SystemAiConfig,
	version: "v4",
	modelFor: (endpoint: SystemAiEndpoint) => SdkModel<"v4">,
): SdkModel<"v4">;
export function createFallbackLanguageModel<
	Version extends "v3" | "v4",
	Options extends { abortSignal?: AbortSignal | undefined },
	Generated,
	Part extends StreamPart,
>(
	config: SystemAiConfig,
	specificationVersion: Version,
	modelFor: (endpoint: SystemAiEndpoint) => {
		specificationVersion: Version;
		supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>>;
		doGenerate(options: Options): PromiseLike<Generated>;
		doStream(options: Options): PromiseLike<StreamResult<Part>>;
	},
) {
	return {
		specificationVersion,
		provider: config.provider,
		modelId: publicSystemAiText(config.model, config.endpoints),
		get supportedUrls() {
			const [first] = config.endpoints;
			return config.endpoints.length === 1 && first ? modelFor(first).supportedUrls : {};
		},
		doGenerate: (options: Options) =>
			runWithSystemAiFailover(config, "agent.generate", options.abortSignal, (endpoint, { abortSignal }) =>
				modelFor(endpoint).doGenerate({ ...options, abortSignal }),
			),
		doStream: (options: Options) =>
			runWithSystemAiFailover(
				config,
				"agent.stream",
				options.abortSignal,
				async (endpoint, { abortSignal }, recordFailure) =>
					probeStream(await modelFor(endpoint).doStream({ ...options, abortSignal }), abortSignal, recordFailure),
			),
	};
}
