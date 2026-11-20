import type { LanguageModel } from "ai";
import type { SystemAiConfig, SystemAiEndpoint } from "./system-config";
import type { AiCallOptions } from "./system-scheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { aiService, getAgentModel } from "./service";
import { createFallbackLanguageModel, resetSystemAiCooldowns, runWithSystemAiFailover } from "./system-scheduler";

vi.mock("@reactive-resume/env/server", () => ({ env: {} }));
const relay = {
	provider: "openai-compatible",
	model: "relay-one",
	apiKey: "fixture-relay-secret",
	baseURL: "https://relay.example/v1?token=private-url-value",
} satisfies SystemAiEndpoint;
const second: SystemAiEndpoint = { ...relay, model: "relay-two", apiKey: "fixture-second-secret" };
const official: SystemAiEndpoint = { provider: "deepseek", model: "official", apiKey: "fixture-official-secret" };
function config(first: SystemAiEndpoint, ...rest: SystemAiEndpoint[]): SystemAiConfig {
	return {
		...first,
		baseURL: first.baseURL ?? "",
		endpoints: [first, ...rest],
		label: "Built-in AI",
		dailyLimit: 15,
		cooldownMs: 180000,
		defaultRelayTimeoutMs: 12000,
	};
}
const upstreamError = new APICallError({
	message: `model unavailable ${relay.apiKey}`,
	url: relay.baseURL,
	requestBodyValues: { apiKey: relay.apiKey },
	statusCode: 400,
});
beforeEach(() => {
	resetSystemAiCooldowns();
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
	const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
	vi.restoreAllMocks();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	for (const secret of [relay.apiKey, second.apiKey, official.apiKey, "private-url-value", "relay.example"])
		expect(logs).not.toContain(secret);
});

describe("system endpoint scheduling", () => {
	it("fails over HTTP 400 in configured order and retries a recovered relay at the cooldown boundary", async () => {
		const chain = config(relay, second, official);
		let now = 1000;
		const invoke = vi.fn(async (ep: SystemAiEndpoint, _options: AiCallOptions) => ep.model);
		invoke.mockRejectedValueOnce(upstreamError);
		const call = () => runWithSystemAiFailover(chain, "parsePdf", undefined, invoke, () => now);
		expect(await call()).toBe(second.model);
		expect(invoke.mock.calls.map(([ep]) => ep.model)).toEqual([relay.model, second.model]);
		expect(invoke.mock.calls.every(([, opts]) => opts.maxRetries === 0)).toBe(true);
		expect(JSON.parse(vi.mocked(console.warn).mock.calls[0]?.[0])).toEqual({
			evt: "system_ai.fallback",
			route: "parsePdf",
			provider: relay.provider,
			model: relay.model,
			attempt: 1,
			total: 3,
			statusCode: 400,
			reason: "http_error",
		});
		// Rotating the credential must not change the circuit identity.
		chain.endpoints[0] = { ...relay, apiKey: "rotated-fixture-key" };
		invoke.mockClear();
		now += 179999;
		expect(await call()).toBe(second.model);
		expect(invoke.mock.calls.map(([ep]) => ep.model)).toEqual([second.model]);
		now++;
		expect(await call()).toBe(relay.model);
	});

	it("probes the last endpoint first when all are cooling and clears a successful probe immediately", async () => {
		const chain = config(relay, second, official);
		const invoke = vi.fn(async (ep: SystemAiEndpoint, _opts: AiCallOptions) => ep.model);
		const call = () => runWithSystemAiFailover(chain, "parseDocx", undefined, invoke);
		invoke
			.mockRejectedValueOnce(upstreamError)
			.mockRejectedValueOnce(upstreamError)
			.mockRejectedValueOnce(upstreamError);
		await expect(call()).rejects.toBe(upstreamError);
		expect(invoke.mock.calls.map(([ep]) => ep.model)).toEqual(["relay-one", "relay-two", "official"]);
		expect(invoke.mock.lastCall?.[1]).toEqual({});
		invoke.mockClear();
		// If the official endpoint is still down, the first relay may have recovered.
		invoke.mockRejectedValueOnce(upstreamError);
		expect(await call()).toBe(relay.model);
		expect(invoke.mock.calls.map(([ep]) => ep.model)).toEqual(["official", "relay-one"]);
		invoke.mockClear();
		expect(await call()).toBe(relay.model);
		expect(invoke).toHaveBeenCalledOnce();
	});

	it.each([1000, undefined])("aborts a hanging relay on its explicit or default timeout (%s)", async (timeoutMs) => {
		vi.useFakeTimers();
		const chain = config({ ...relay, timeoutMs }, official);
		let signal: AbortSignal | undefined;
		const invoke = vi.fn((ep: SystemAiEndpoint, opts: AiCallOptions) => {
			if (ep === official) return Promise.resolve(ep.model);
			signal = opts.abortSignal;
			return new Promise<string>(() => {});
		});
		const result = runWithSystemAiFailover(chain, "atsReview", undefined, invoke);
		await vi.advanceTimersByTimeAsync((timeoutMs ?? 12000) - 1);
		expect(invoke).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toBe("official");
		expect(signal?.aborted).toBe(true);
		expect(invoke.mock.lastCall?.[1]).toEqual({});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("uses an explicit official timeout even for a single node and otherwise retains the caller signal", async () => {
		vi.useFakeTimers();
		const caller = new AbortController();
		const timed = runWithSystemAiFailover(
			config({ ...official, timeoutMs: 1200 }),
			"parseText",
			caller.signal,
			() => new Promise<never>(() => {}),
		);
		const assertion = expect(timed).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(1200);
		await assertion;
		const opts = await runWithSystemAiFailover(config(official), "parseText", caller.signal, (_ep, opts) =>
			Promise.resolve(opts),
		);
		expect(opts).toEqual({ abortSignal: caller.signal });
	});

	it.each(["before", "during"])(
		"propagates caller cancellation %s the first attempt without switching or cooling",
		async (when) => {
			const chain = config(relay, official);
			const controller = new AbortController();
			const reason = new DOMException("caller canceled", "AbortError");
			if (when === "before") controller.abort(reason);
			const invoke = vi.fn(() => {
				controller.abort(reason);
				return Promise.reject(upstreamError);
			});
			await expect(runWithSystemAiFailover(chain, "parseText", controller.signal, invoke)).rejects.toBe(reason);
			expect(invoke).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
			expect(console.warn).not.toHaveBeenCalled();
			expect(await runWithSystemAiFailover(chain, "parseText", undefined, async (ep) => ep.model)).toBe(relay.model);
		},
	);

	it.each(["temporarily unavailable", '{"error":"synthetic failure"}'])(
		"retries a dirty HTTP 200 from the real parseText and SDK path",
		async (garbage) => {
			const chain = config(relay, official);
			const requests: string[] = [];
			vi.stubGlobal(
				"fetch",
				vi.fn((_url, init: RequestInit) => {
					const model = JSON.parse(String(init.body)).model;
					requests.push(model);
					return Response.json({
						id: "test",
						created: 1,
						model,
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: model === relay.model ? garbage : '{"basics":{"name":"Synthetic"}}',
								},
								finish_reason: "stop",
							},
						],
					});
				}),
			);
			const result = await runWithSystemAiFailover(chain, "parseText", undefined, (ep, opts) =>
				aiService.parseText({ ...ep, baseURL: ep.baseURL ?? "", isSystem: true, text: "Synthetic" }, opts),
			);
			expect(result.basics.name).toBe("Synthetic");
			expect(requests).toEqual([relay.model, official.model]);
			expect(JSON.parse(vi.mocked(console.warn).mock.calls[0]?.[0]).reason).toBe("invalid_response");
		},
	);
});

type V3 = Extract<LanguageModel, { specificationVersion: "v3" }>;
type StreamResult = Awaited<ReturnType<V3["doStream"]>>;
type Part = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
const text = (delta: string): Part => ({ type: "text-delta", id: "text", delta });
function parts(...chunks: Part[]): StreamResult {
	return {
		stream: new ReadableStream<Part>({
			start(c) {
				for (const chunk of chunks) c.enqueue(chunk);
				c.close();
			},
		}),
	};
}
function streaming(first: V3, last: V3) {
	const chain = config({ ...relay, timeoutMs: 1000 }, official);
	return createFallbackLanguageModel(chain, "v3", (ep) => (ep.model === relay.model ? first : last)) satisfies V3;
}
async function collect(stream: ReadableStream<Part>) {
	const chunks: Part[] = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

describe("system language model", () => {
	it("delivers an official DeepSeek SSE completion through the real Agent model after an OpenAI HTTP 400", async () => {
		const primary = { ...relay, provider: "openai" as const, model: "gpt-5", baseURL: undefined };
		const chain = config(primary, official);
		const paths: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn((url, init: RequestInit) => {
				paths.push(new URL(String(url)).pathname);
				if (JSON.parse(String(init.body)).model === primary.model)
					return Response.json({ error: { message: primary.apiKey } }, { status: 400 });
				const chunk = {
					id: "fixture",
					model: official.model,
					created: 1,
					choices: [{ index: 0, delta: { content: "Official response" }, finish_reason: "stop" }],
				};
				return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
					headers: { "content-type": "text/event-stream" },
				});
			}),
		);
		const result = streamText({ model: getAgentModel(chain, chain), prompt: "Synthetic", maxRetries: 0 });
		await expect(result.text).resolves.toBe("Official response");
		expect(paths).toEqual(["/v1/chat/completions", "/v1/chat/completions"]);
	});
	it("shares the generate circuit with streams and works with native V4 provider implementations", async () => {
		const first = new MockLanguageModelV3({
			doGenerate: () => Promise.reject(upstreamError),
		});
		const data = {
			content: [{ type: "text" as const, text: "ok" }],
			finishReason: { unified: "stop" as const, raw: "stop" },
			usage: {
				inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
				outputTokens: { total: 1, text: 1, reasoning: 0 },
			},
			warnings: [],
		};
		const last = new MockLanguageModelV3({ doGenerate: data, doStream: parts(text("official")) });
		const model = streaming(first, last);
		await expect(model.doGenerate({ prompt: [] })).resolves.toMatchObject({ content: data.content });
		expect(await collect((await model.doStream({ prompt: [] })).stream)).toEqual([text("official")]);
		expect(first.doStreamCalls).toHaveLength(0);
		const chain = config(relay, official);
		expect(getAgentModel(chain, chain).specificationVersion).toBe("v4");
	});

	it.each(["open", "error chunk", "closed", "read error", "empty delta"])(
		"discards preamble on %s and yields only the winning stream",
		async (kind) => {
			const canceled = vi.fn();
			const first = new MockLanguageModelV3({
				doStream: () => {
					if (kind === "open") return Promise.reject(upstreamError);
					return Promise.resolve({
						stream: new ReadableStream<Part>({
							start(c) {
								c.enqueue({ type: "stream-start", warnings: [] });
								c.enqueue({ type: "text-start", id: "losing-text" });
								if (kind === "empty delta") c.enqueue(text(""));
								if (kind === "closed") c.close();
								else if (kind === "read error") c.error(upstreamError);
								else c.enqueue({ type: "error", error: upstreamError });
							},
							cancel: canceled,
						}),
					});
				},
			});
			const winning: Part[] = [{ type: "text-start", id: "text" }, text("ok")];
			const last = new MockLanguageModelV3({ doStream: parts(...winning) });
			const result = await streaming(first, last).doStream({ prompt: [] });
			expect(await collect(result.stream)).toEqual(winning);
			if (kind === "error chunk" || kind === "empty delta") expect(canceled).toHaveBeenCalledOnce();
			expect(last.doStreamCalls).toHaveLength(1);
		},
	);

	it("cancels a stream stuck after metadata and switches at the first-output deadline", async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const first = new MockLanguageModelV3({
			doStream: {
				stream: new ReadableStream<Part>({
					start(c) {
						c.enqueue({ type: "response-metadata", id: "relay" });
					},
					cancel,
				}),
			},
		});
		const last = new MockLanguageModelV3({ doStream: parts(text("ok")) });
		const pending = streaming(first, last).doStream({ prompt: [] });
		await vi.advanceTimersByTimeAsync(1000);
		expect(await collect((await pending).stream)).toEqual([text("ok")]);
		expect(cancel).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("disposes a connection that opens after its deadline", async () => {
		vi.useFakeTimers();
		const late = Promise.withResolvers<StreamResult>();
		const cancel = vi.fn();
		const first = new MockLanguageModelV3({ doStream: () => late.promise });
		const last = new MockLanguageModelV3({ doStream: parts(text("ok")) });
		const pending = streaming(first, last).doStream({ prompt: [] });
		await vi.advanceTimersByTimeAsync(1000);
		expect(await collect((await pending).stream)).toEqual([text("ok")]);
		late.resolve({ stream: new ReadableStream({ cancel }) });
		await vi.advanceTimersByTimeAsync(0);
		expect(cancel).toHaveBeenCalledOnce();
	});

	it.each(["error chunk", "read error", "caller abort"])(
		"clears TTFT after output and never replays on %s",
		async (kind) => {
			vi.useFakeTimers();
			const caller = new AbortController();
			let source!: ReadableStreamDefaultController<Part>;
			const first = new MockLanguageModelV3({
				doStream: {
					stream: new ReadableStream<Part>({
						start(c) {
							source = c;
							c.enqueue(text("only once"));
						},
					}),
				},
			});
			const last = new MockLanguageModelV3({});
			const result = await streaming(first, last).doStream({ prompt: [], abortSignal: caller.signal });
			const reader = result.stream.getReader();
			await expect(reader.read()).resolves.toMatchObject({ value: text("only once") });
			await vi.advanceTimersByTimeAsync(60000);
			expect(first.doStreamCalls[0]?.abortSignal?.aborted).toBe(false);
			if (kind === "error chunk") {
				source.enqueue({ type: "error", error: upstreamError });
				source.close();
				await expect(reader.read()).resolves.toMatchObject({ value: { type: "error", error: upstreamError } });
				await expect(reader.read()).resolves.toMatchObject({ done: true });
			} else {
				if (kind === "caller abort") caller.abort(upstreamError);
				else source.error(upstreamError);
				await expect(reader.read()).rejects.toBe(upstreamError);
			}
			expect(last.doStreamCalls).toHaveLength(0);
			const next = await runWithSystemAiFailover(config(relay, official), "parseText", undefined, (ep) =>
				Promise.resolve(ep.model),
			);
			expect(next).toBe(kind === "caller abort" ? relay.model : official.model);
		},
	);
});
