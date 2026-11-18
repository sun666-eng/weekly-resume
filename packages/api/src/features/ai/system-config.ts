import { env } from "@reactive-resume/env/server";

export function getSystemAiConfig() {
	const { SYSTEM_AI_PROVIDER: provider, SYSTEM_AI_MODEL: model, SYSTEM_AI_API_KEY: apiKey } = env;
	if (!provider || !model || !apiKey) return null;
	return {
		provider,
		model,
		apiKey,
		baseURL: env.SYSTEM_AI_BASE_URL ?? "",
		label: env.SYSTEM_AI_LABEL ?? "Built-in AI",
		dailyLimit: env.SYSTEM_AI_DAILY_LIMIT,
	};
}
