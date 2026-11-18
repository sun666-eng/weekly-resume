import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@reactive-resume/utils/monorepo.node", () => ({ findWorkspaceRoot: () => undefined }));

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("built-in AI configuration", () => {
	const keys = [
		"TRUST_PROXY",
		"SYSTEM_AI_PROVIDER",
		"SYSTEM_AI_MODEL",
		"SYSTEM_AI_API_KEY",
		"SYSTEM_AI_BASE_URL",
		"SYSTEM_AI_LABEL",
		"SYSTEM_AI_DAILY_LIMIT",
	] as const;
	beforeEach(() => {
		vi.stubEnv("APP_URL", "https://resume.example");
		vi.stubEnv("DATABASE_URL", "postgresql://localhost/disposable");
		vi.stubEnv("AUTH_SECRET", "disposable");
		for (const key of keys) vi.stubEnv(key, undefined);
	});
	it("starts with no provider, direct peers and fifteen daily calls", async () => {
		const { env } = await import("./server");
		expect(env.TRUST_PROXY).toBe(false);
		expect(env.SYSTEM_AI_PROVIDER).toBeUndefined();
		expect(env.SYSTEM_AI_API_KEY).toBeUndefined();
		expect(env.SYSTEM_AI_DAILY_LIMIT).toBe(15);
	});
	it("accepts explicit server-side settings", async () => {
		const values = [
			"true",
			"openai-compatible",
			" test-model ",
			"test-key",
			"https://provider.example/v1",
			" Test provider ",
			"22",
		];
		for (const [index, key] of keys.entries()) vi.stubEnv(key, values[index]);
		const { env } = await import("./server");
		expect(keys.map((key) => env[key])).toEqual([
			true,
			"openai-compatible",
			"test-model",
			"test-key",
			"https://provider.example/v1",
			"Test provider",
			22,
		]);
	});
	it.each([
		["SYSTEM_AI_DAILY_LIMIT", "0"],
		["SYSTEM_AI_DAILY_LIMIT", "1.5"],
		["SYSTEM_AI_PROVIDER", "no-provider"],
		["SYSTEM_AI_BASE_URL", "file:///tmp"],
		["TRUST_PROXY", "sometimes"],
	])("rejects invalid %s", async (key, value) => {
		vi.stubEnv(key, value);
		await expect(import("./server")).rejects.toThrow();
	});
});

describe("root resume configuration", () => {
	it.each([
		[undefined, undefined],
		["", undefined],
		["   ", undefined],
		[" root-id ", "root-id"],
	])("normalizes %s to %s", async (value, expected) => {
		vi.stubEnv("APP_URL", "https://resume.example");
		vi.stubEnv("DATABASE_URL", "postgresql://localhost/disposable");
		vi.stubEnv("AUTH_SECRET", "disposable");
		vi.stubEnv("ROOT_RESUME_ID", value);
		const { env } = await import("./server");
		expect(env.ROOT_RESUME_ID).toBe(expected);
	});
});
