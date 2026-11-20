import { resolve } from "node:path";
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
		"SYSTEM_AI_ENDPOINTS_FILE",
		"SYSTEM_AI_ENDPOINTS_JSON",
		"SYSTEM_AI_COOLDOWN_SECONDS",
		"SYSTEM_AI_RELAY_TIMEOUT_MS",
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
		expect(env.SYSTEM_AI_ENDPOINTS_FILE).toBeUndefined();
		expect(env.SYSTEM_AI_ENDPOINTS_JSON).toBeUndefined();
		expect(env.SYSTEM_AI_COOLDOWN_SECONDS).toBe(180);
		expect(env.SYSTEM_AI_RELAY_TIMEOUT_MS).toBe(12000);
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
			resolve("fixture.json"),
			"[]",
			"10",
			"120000",
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
			resolve("fixture.json"),
			"[]",
			10,
			120000,
		]);
	});
	it.each([
		["SYSTEM_AI_DAILY_LIMIT", "0"],
		["SYSTEM_AI_DAILY_LIMIT", "1.5"],
		["SYSTEM_AI_PROVIDER", "no-provider"],
		["SYSTEM_AI_BASE_URL", "file:///tmp"],
		["TRUST_PROXY", "sometimes"],
		["SYSTEM_AI_ENDPOINTS_FILE", "relative/fixture.json"],
		["SYSTEM_AI_COOLDOWN_SECONDS", "9"],
		["SYSTEM_AI_COOLDOWN_SECONDS", "10.5"],
		["SYSTEM_AI_COOLDOWN_SECONDS", "3601"],
		["SYSTEM_AI_RELAY_TIMEOUT_MS", "999"],
		["SYSTEM_AI_RELAY_TIMEOUT_MS", "120001"],
		["SYSTEM_AI_RELAY_TIMEOUT_MS", "1000.5"],
	])("rejects invalid %s", async (key, value) => {
		vi.stubEnv(key, value);
		await expect(import("./server")).rejects.toThrow();
	});
	it("reports only field names for invalid environment values", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			vi.stubEnv("SYSTEM_AI_BASE_URL", "opaque-secret");
			vi.stubEnv("SYSTEM_AI_ENDPOINTS_JSON", '[{"apiKey":"private-fixture"}]');
			await expect(import("./server")).rejects.toThrow(/^Invalid environment variables: SYSTEM_AI_BASE_URL$/);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
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
