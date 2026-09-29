import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "./production-config-checks";

const valid = {
	APP_URL: "https://weeklyresumeai.online",
	AUTH_SECRET: "a".repeat(64),
	ENCRYPTION_SECRET: "b".repeat(64),
	POSTGRES_PASSWORD: "c".repeat(64),
	SMTP_HOST: "smtpdm.aliyun.com",
	SMTP_PORT: "465",
	SMTP_SECURE: "true",
	SMTP_USER: "noreply@weeklyresumeai.online",
	SMTP_PASS: "private-smtp-secret",
	SMTP_FROM: "Weekly Resume <noreply@weeklyresumeai.online>",
};
const failures = (overrides: Record<string, string | undefined>) =>
	checkProductionConfig({ ...valid, ...overrides })
		.filter((check) => !check.passed)
		.map((check) => check.id);

describe("production release configuration gate", () => {
	it("accepts configured production values without requiring live services", () => expect(failures({})).toEqual([]));
	it.each([
		"http://weeklyresumeai.online",
		"https://localhost",
		"https://127.0.0.1",
		"https://site.example.com",
		"https://weeklyresumeai.online/path",
		"https://user:pass@weeklyresumeai.online",
		"invalid",
	])("rejects invalid public origin %s", (APP_URL) => expect(failures({ APP_URL })).toContain("APP_URL"));
	it("rejects template secrets and unsafe URI interpolation", () => {
		expect(failures({ AUTH_SECRET: "replace-with-a-random-64-character-hex-value" })).toContain("AUTH_SECRET");
		expect(failures({ POSTGRES_PASSWORD: `${"c".repeat(32)}@host` })).toContain("POSTGRES_PASSWORD-url-safe");
		expect(failures({ ENCRYPTION_SECRET: valid.AUTH_SECRET })).toContain("secret-independence");
	});
	it.each(["FLAG_DISABLE_API_RATE_LIMIT", "FLAG_ALLOW_UNSAFE_AI_BASE_URL", "FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI"])(
		"rejects the test switch %s",
		(key) => expect(failures({ [key]: "true" })).toContain(key),
	);
	it("keeps email configuration required for existing users when registration is closed", () =>
		expect(failures({ FLAG_DISABLE_SIGNUPS: "true", SMTP_PASS: "" })).toContain("SMTP_PASS"));
	it("permits deliberately disabled email auth without SMTP", () =>
		expect(
			failures({
				FLAG_DISABLE_EMAIL_AUTH: "true",
				SMTP_HOST: undefined,
				SMTP_USER: undefined,
				SMTP_PASS: undefined,
				SMTP_FROM: undefined,
			}),
		).toEqual([]));
	it("rejects malformed boolean flags instead of silently accepting them", () =>
		expect(failures({ FLAG_DISABLE_EMAIL_AUTH: "off" })).toContain("FLAG_DISABLE_EMAIL_AUTH-boolean"));
	it("checks TLS mode without forbidding STARTTLS", () => {
		expect(failures({ SMTP_SECURE: "false" })).toContain("smtp-tls-mode");
		expect(failures({ SMTP_PORT: "587", SMTP_SECURE: "false" })).toEqual([]);
		expect(failures({ SMTP_HOST: "mailpit" })).toContain("smtp-not-test");
	});
	it("rejects ports and storage locations inconsistent with the compose mapping", () => {
		expect(failures({ PORT: "3100", LOCAL_STORAGE_PATH: "/tmp/data" })).toEqual(
			expect.arrayContaining(["PORT", "LOCAL_STORAGE_PATH"]),
		);
	});
	it("never includes credentials in either successful or failed results", () => {
		const output = JSON.stringify(checkProductionConfig({ ...valid, SMTP_PASS: "replace-with-SUPER-SECRET" }));
		for (const secret of [
			valid.AUTH_SECRET,
			valid.ENCRYPTION_SECRET,
			valid.POSTGRES_PASSWORD,
			"replace-with-SUPER-SECRET",
		])
			expect(output).not.toContain(secret);
	});
});
