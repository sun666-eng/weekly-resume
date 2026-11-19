import { beforeEach, describe, expect, it, vi } from "vitest";
import * as quotaService from "../ai/quota";

const { dbMock, queryMock, queryState } = vi.hoisted(() => {
	const state = {
		rows: [] as unknown[],
		whereArg: undefined as unknown,
		orderByArgs: [] as unknown[],
	};
	const query = {
		from: vi.fn(() => query),
		where: vi.fn((arg: unknown) => {
			state.whereArg = arg;
			return query;
		}),
		orderBy: vi.fn((...args: unknown[]) => {
			state.orderByArgs = args;
			return Object.assign(Promise.resolve(state.rows), { limit: query.limit });
		}),
		limit: vi.fn(async () => state.rows),
	};

	return {
		dbMock: { select: vi.fn(() => query) },
		queryMock: query,
		queryState: state,
	};
});

vi.mock("@reactive-resume/db/client", () => ({ db: dbMock }));
vi.mock("@reactive-resume/db/schema", () => ({
	aiProvider: {
		id: "ai_provider.id",
		userId: "ai_provider.user_id",
		label: "ai_provider.label",
		provider: "ai_provider.provider",
		model: "ai_provider.model",
		baseUrl: "ai_provider.base_url",
		encryptedApiKey: "ai_provider.encrypted_api_key",
		apiKeySalt: "ai_provider.api_key_salt",
		apiKeyHash: "ai_provider.api_key_hash",
		apiKeyPreview: "ai_provider.api_key_preview",
		testStatus: "ai_provider.test_status",
		testError: "ai_provider.test_error",
		lastTestedAt: "ai_provider.last_tested_at",
		lastUsedAt: "ai_provider.last_used_at",
		enabled: "ai_provider.enabled",
		createdAt: "ai_provider.created_at",
		updatedAt: "ai_provider.updated_at",
	},
}));
vi.mock("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	asc: (value: unknown) => ({ type: "asc", value }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings: [...strings], values }),
}));
vi.mock("../ai/credentials", () => ({
	isCredentialEncryptionConfigured: vi.fn(() => true),
	assertCredentialEncryptionConfigured: vi.fn(),
	decryptCredential: vi.fn(() => "decrypted-key"),
	encryptCredential: vi.fn(),
	redactEncryptedCredential: vi.fn(() => ({
		apiKeyFingerprint: "fingerprint",
		apiKeyPreview: "sk-...test",
	})),
}));
vi.mock("../ai/service", () => ({ testConnection: vi.fn() }));
vi.mock("../ai/url-policy", () => ({ resolveAiBaseUrl: vi.fn() }));

const config = vi.hoisted(() => ({
	SYSTEM_AI_PROVIDER: "deepseek",
	SYSTEM_AI_MODEL: "synthetic",
	SYSTEM_AI_LABEL: "Public label",
	SYSTEM_AI_BASE_URL: "https://private.example",
	SYSTEM_AI_API_KEY: "synthetic-secret-for-tests",
	SYSTEM_AI_DAILY_LIMIT: 15,
	SYSTEM_AI_ENDPOINTS_JSON: undefined as string | undefined,
}));
vi.mock("@reactive-resume/env/server", () => ({ env: config }));
const { isCredentialEncryptionConfigured } = await import("../ai/credentials");
const { aiProvidersService } = await import("./service");

function providerRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "provider-1",
		userId: "user-1",
		label: "OpenAI",
		provider: "openai",
		model: "gpt-5-mini",
		baseUrl: null,
		encryptedApiKey: "encrypted-key",
		apiKeySalt: "salt",
		apiKeyHash: "hash",
		apiKeyPreview: "preview",
		testStatus: "success",
		testError: null,
		lastTestedAt: new Date("2026-07-01T00:00:00Z"),
		lastUsedAt: new Date("2026-07-07T00:00:00Z"),
		enabled: true,
		createdAt: new Date("2026-07-01T00:00:00Z"),
		updatedAt: new Date("2026-07-01T00:00:00Z"),
		...overrides,
	};
}

describe("aiProvidersService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryState.rows = [];
		queryState.whereArg = undefined;
		queryState.orderByArgs = [];
		config.SYSTEM_AI_ENDPOINTS_JSON = undefined;
	});

	it("discovers a read-only system provider without exposing credentials or requiring personal-key encryption", async () => {
		vi.mocked(isCredentialEncryptionConfigured).mockReturnValueOnce(false);
		const providers = await aiProvidersService.list({ userId: "synthetic-user" });
		expect(providers).toMatchObject([
			{
				id: "__system_default__",
				isSystem: true,
				label: "Public label",
				model: "synthetic",
				enabled: true,
				testStatus: "success",
				apiKeyPreview: "Built-in",
				apiKeyFingerprint: "",
				baseURL: null,
				quota: { dailyLimit: 15, usedToday: 0, remainingToday: 15 },
			},
		]);
		expect(JSON.stringify(providers)).not.toContain(config.SYSTEM_AI_API_KEY);
		expect(dbMock.select).not.toHaveBeenCalled();
		await expect(aiProvidersService.getDefaultRunnable({ userId: "synthetic-user" })).resolves.toMatchObject({
			id: "__system_default__",
			apiKey: config.SYSTEM_AI_API_KEY,
		});
	});
	it.each(["update", "delete", "test"] as const)(
		"rejects %s on the virtual ID before accessing the database",
		async (method) => {
			await expect(aiProvidersService[method]({ id: "__system_default__", userId: "u" })).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(dbMock.select).not.toHaveBeenCalled();
		},
	);

	it("keeps endpoint names, URLs, credentials and routing settings out of the client descriptor", async () => {
		config.SYSTEM_AI_ENDPOINTS_JSON = JSON.stringify([
			{
				name: "internal-relay",
				provider: "openai-compatible",
				model: "first-model",
				apiKey: "private-api-key",
				baseURL: "https://relay.example/v1?token=private-url-token",
			},
			{ name: "internal-official", provider: "deepseek", model: "last-model", apiKey: "private-fallback-key" },
		]);
		vi.mocked(isCredentialEncryptionConfigured).mockReturnValueOnce(false);
		const [descriptor] = await aiProvidersService.list({ userId: "listed-user" });
		expect(descriptor).toMatchObject({
			provider: "openai-compatible",
			model: "first-model",
			baseURL: null,
			isSystem: true,
			label: "Public label",
		});
		expect(JSON.stringify(descriptor)).not.toMatch(
			/internal-|private-|last-model|relay\.example|endpoints|systemConfig|cooldown|timeout/i,
		);
	});
	it("redacts a display field that accidentally contains credentials from another endpoint", async () => {
		config.SYSTEM_AI_ENDPOINTS_JSON = JSON.stringify([
			{ provider: "openai", model: "model-with-private-token", apiKey: "primary-private-key" },
			{
				provider: "deepseek",
				model: "official",
				apiKey: "second-private-key",
				baseURL: "https://relay.example/v1?token=private-token",
			},
		]);
		vi.mocked(isCredentialEncryptionConfigured).mockReturnValueOnce(false);
		const [descriptor] = await aiProvidersService.list({ userId: "listed-user" });
		expect(descriptor?.model).toBe("[redacted]");
	});
	it("keeps personal providers visible when the shared quota meter is unavailable", async () => {
		queryState.rows = [providerRow()];
		const quota = vi.spyOn(quotaService, "readSystemQuota").mockRejectedValueOnce(new Error("Synthetic Redis outage"));
		try {
			const providers = await aiProvidersService.list({ userId: "user-1" });
			expect(providers.map((p) => p.id)).toEqual(["provider-1", "__system_default__"]);
			expect(providers[1]).not.toHaveProperty("quota");
		} finally {
			quota.mockRestore();
		}
	});
	it("does not offer an incompletely configured system provider", async () => {
		const key = config.SYSTEM_AI_API_KEY;
		try {
			config.SYSTEM_AI_API_KEY = "";
			await expect(aiProvidersService.getDefaultRunnable({ userId: "u" })).resolves.toBeNull();
			await expect(aiProvidersService.getRunnableById({ id: "__system_default__", userId: "u" })).rejects.toMatchObject(
				{ code: "AI_PROVIDER_UNAVAILABLE" },
			);
		} finally {
			config.SYSTEM_AI_API_KEY = key;
		}
	});
	it("gets the first enabled and tested provider by creation order", async () => {
		queryState.rows = [providerRow({ id: "first-created" })];

		await expect(aiProvidersService.getDefaultRunnable({ userId: "user-1" })).resolves.toMatchObject({
			id: "first-created",
			apiKey: "decrypted-key",
		});

		expect(queryState.whereArg).toEqual({
			type: "and",
			conditions: [
				{ type: "eq", left: "ai_provider.user_id", right: "user-1" },
				{ type: "eq", left: "ai_provider.enabled", right: true },
				{ type: "eq", left: "ai_provider.test_status", right: "success" },
			],
		});
		expect(queryState.orderByArgs).toEqual([{ type: "asc", value: "ai_provider.created_at" }]);
		expect(queryMock.limit).toHaveBeenCalledWith(1);
	});
});
