import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { aiProviderSchema } from "@reactive-resume/ai/types";
import { env } from "@reactive-resume/env/server";

const endpointSchema = z.object({
	name: z.string().trim().optional(),
	provider: aiProviderSchema,
	model: z.string().trim().min(1),
	apiKey: z.string().trim().min(1),
	baseURL: z.url({ protocol: /^https?$/ }).optional(),
	timeoutMs: z.number().int().min(1000).max(120000).optional(),
});

export type SystemAiEndpoint = z.infer<typeof endpointSchema>;
export type SystemAiConfig = NonNullable<ReturnType<typeof getSystemAiConfig>>;

// Model IDs and labels are operator-supplied display text. Withhold a value if it repeats a configured secret.
export function publicSystemAiText(value: string, endpoints: SystemAiEndpoint[]) {
	for (const { apiKey, baseURL } of endpoints) {
		if (apiKey && value.includes(apiKey)) return "[redacted]";
		if (!baseURL) continue;
		const url = URL.parse(baseURL);
		if (
			url &&
			[baseURL, url.username, url.password, ...url.searchParams.values()].some((part) => part && value.includes(part))
		) {
			return "[redacted]";
		}
	}
	return value;
}

function parseEndpoints(source: string, contents: string): SystemAiEndpoint[] {
	let value: unknown;
	try {
		value = JSON.parse(contents.replace(/^\uFEFF/, ""));
	} catch {
		throw new Error(`${source} must contain a UTF-8 JSON array.`);
	}
	if (!Array.isArray(value) || value.length === 0) throw new Error(`${source} must contain at least one endpoint.`);
	return value.map((entry, index) => {
		const result = endpointSchema.safeParse(entry);
		if (!result.success) {
			// Only the index and schema-owned field name can appear in diagnostics.
			const field = result.error.issues[0]?.path[0];
			const suffix = typeof field === "string" && Object.hasOwn(endpointSchema.shape, field) ? `.${field}` : "";
			throw new Error(`Invalid endpoint in ${source} at [${index}]${suffix}.`);
		}
		return result.data;
	});
}

function configuredEndpoints(): SystemAiEndpoint[] {
	const file = env.SYSTEM_AI_ENDPOINTS_FILE;
	if (file !== undefined) {
		if (!isAbsolute(file)) throw new Error("SYSTEM_AI_ENDPOINTS_FILE must be an absolute path.");
		let contents: string;
		try {
			contents = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file));
		} catch {
			throw new Error("Cannot read SYSTEM_AI_ENDPOINTS_FILE as UTF-8.");
		}
		return parseEndpoints("SYSTEM_AI_ENDPOINTS_FILE", contents);
	}
	if (env.SYSTEM_AI_ENDPOINTS_JSON !== undefined)
		return parseEndpoints("SYSTEM_AI_ENDPOINTS_JSON", env.SYSTEM_AI_ENDPOINTS_JSON);
	const { SYSTEM_AI_PROVIDER: provider, SYSTEM_AI_MODEL: model, SYSTEM_AI_API_KEY: apiKey } = env;
	return provider && model && apiKey ? [{ provider, model, apiKey, baseURL: env.SYSTEM_AI_BASE_URL }] : [];
}

export function getSystemAiConfig() {
	const endpoints = configuredEndpoints();
	const first = endpoints[0];
	if (!first) return null;
	return {
		provider: first.provider,
		model: first.model,
		apiKey: first.apiKey,
		baseURL: first.baseURL ?? "",
		label: publicSystemAiText(env.SYSTEM_AI_LABEL ?? "Built-in AI", endpoints),
		dailyLimit: env.SYSTEM_AI_DAILY_LIMIT,
		endpoints,
		cooldownMs: (env.SYSTEM_AI_COOLDOWN_SECONDS ?? 180) * 1000,
		defaultRelayTimeoutMs: env.SYSTEM_AI_RELAY_TIMEOUT_MS ?? 12000,
	};
}
