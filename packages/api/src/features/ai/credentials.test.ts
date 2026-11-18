import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
	ENCRYPTION_SECRET: "test-secret-with-enough-entropy",
	AUTH_SECRET: "",
	REDIS_URL: "redis://localhost:6379",
}));

vi.mock("@reactive-resume/env/server", () => ({ env: envMock }));

const {
	assertAgentEnvironment,
	decryptCredential,
	encryptCredential,
	fingerprintCredential,
	getAgentToolApprovalSecret,
	isAgentEnvironmentConfigured,
	redactEncryptedCredential,
} = await import("./credentials");

describe("AI credential encryption", () => {
	it("encrypts and decrypts provider API keys without storing plaintext", () => {
		const encrypted = encryptCredential("sk-test-secret");

		expect(encrypted.encryptedApiKey).not.toContain("sk-test-secret");
		expect(encrypted.apiKeyPreview).toBe("sk-t...cret");
		expect(decryptCredential(encrypted.encryptedApiKey)).toBe("sk-test-secret");
	});

	it("generates salted non-revealable fingerprints", () => {
		const first = fingerprintCredential("sk-test-secret", "salt-a");
		const again = fingerprintCredential("sk-test-secret", "salt-a");
		const differentSalt = fingerprintCredential("sk-test-secret", "salt-b");

		expect(first).toBe(again);
		expect(first).not.toBe(differentSalt);
		expect(first).not.toContain("sk-test-secret");
	});

	it("redacts stored encrypted credential fields from API responses", () => {
		const encrypted = encryptCredential("sk-test-secret");

		const redacted = redactEncryptedCredential({
			encryptedApiKey: encrypted.encryptedApiKey,
			apiKeySalt: encrypted.apiKeySalt,
			apiKeyHash: encrypted.apiKeyHash,
			apiKeyPreview: encrypted.apiKeyPreview,
		});

		expect(redacted).toEqual({
			apiKeyFingerprint: encrypted.apiKeyHash,
			apiKeyPreview: encrypted.apiKeyPreview,
		});
		expect(JSON.stringify(redacted)).not.toContain(encrypted.encryptedApiKey);
		expect(JSON.stringify(redacted)).not.toContain(encrypted.apiKeySalt);
	});
});

describe("AI agent environment", () => {
	it("requires Redis and a signing secret while keeping personal credentials separately encrypted", () => {
		expect(isAgentEnvironmentConfigured()).toBe(true);
		expect(() => assertAgentEnvironment()).not.toThrow();

		envMock.REDIS_URL = "";
		expect(isAgentEnvironmentConfigured()).toBe(false);
		expect(() => assertAgentEnvironment()).toThrow("AGENT_ENVIRONMENT_UNAVAILABLE");

		envMock.REDIS_URL = "redis://localhost:6379";
		envMock.ENCRYPTION_SECRET = "";
		envMock.AUTH_SECRET = "synthetic-auth-only";
		expect(isAgentEnvironmentConfigured()).toBe(true);
		expect(getAgentToolApprovalSecret()).not.toBe(envMock.AUTH_SECRET);
		expect(getAgentToolApprovalSecret()).toHaveLength(64);
		expect(() => encryptCredential("synthetic-personal")).toThrow("AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE");
		envMock.AUTH_SECRET = "";
		expect(isAgentEnvironmentConfigured()).toBe(false);
		expect(() => assertAgentEnvironment()).toThrow("AGENT_ENVIRONMENT_UNAVAILABLE");
	});
});
