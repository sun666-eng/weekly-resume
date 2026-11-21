import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@reactive-resume/env/server";
import { auth } from "./config";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/email/transport", () => ({ sendEmail: sendEmailMock }));

// These tests inspect configuration only. Initializing Better Auth would seed
// OAuth resources and require a database, which belongs in integration tests.
vi.mock("better-auth", async (importOriginal) => {
	const original = await importOriginal<typeof import("better-auth")>();
	return { ...original, betterAuth: (options: unknown) => ({ options }) };
});

describe("social provider signup policy", () => {
	it.each(["google", "github", "linkedin"] as const)(
		"allows implicit signup through %s while honoring the global signup restriction",
		(provider) => {
			// Better Auth 1.7 allows a lazy `() => config` form; ours are always static objects.
			const config = auth.options.socialProviders?.[provider];
			if (typeof config === "function") throw new TypeError(`${provider} provider config should be a static object`);

			expect(config).not.toHaveProperty("disableImplicitSignUp");
			expect(config?.disableSignUp).toBe(env.FLAG_DISABLE_SIGNUPS);
		},
	);
});

describe("session freshness", () => {
	it("disables the freshness gate so provider unlinking works for week-old sessions", () => {
		expect(auth.options.session?.freshAge).toBe(0);
	});
});

const callbacks = auth.options as unknown as {
	emailAndPassword: { sendResetPassword: (input: unknown) => Promise<void> };
	emailVerification: { sendVerificationEmail: (input: unknown) => Promise<void> };
	user: { changeEmail: { sendChangeEmailConfirmation: (input: unknown) => Promise<void> } };
};

const callbackCases = [
	{
		purpose: "password_reset",
		invoke: () =>
			callbacks.emailAndPassword.sendResetPassword({
				user: { email: "person@example.com" },
				url: "https://example.com/reset?token=secret",
			}),
	},
	{
		purpose: "email_verification",
		invoke: () =>
			callbacks.emailVerification.sendVerificationEmail({
				user: { email: "person@example.com" },
				url: "https://example.com/verify?token=secret",
			}),
	},
	{
		purpose: "change_email",
		invoke: () =>
			callbacks.user.changeEmail.sendChangeEmailConfirmation({
				user: { email: "old@example.com" },
				newEmail: "new@example.com",
				url: "https://example.com/change?token=secret",
			}),
	},
] as const;

beforeEach(() => {
	vi.clearAllMocks();
	sendEmailMock.mockResolvedValue({ status: "accepted", purpose: "generic", accepted: [], rejected: [], latencyMs: 1 });
});

describe("authentication email callbacks", () => {
	it.each(callbackCases)("passes the $purpose purpose to the email transport", async ({ purpose, invoke }) => {
		await invoke();
		expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ purpose }));
	});

	it.each(callbackCases)("logs a safe diagnostic when $purpose delivery is skipped", async ({ purpose, invoke }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		sendEmailMock.mockResolvedValueOnce({
			status: "skipped",
			purpose,
			reason: "not_configured",
			missingKeys: ["SMTP_HOST"],
		});

		await expect(invoke()).resolves.toBeUndefined();

		expect(warn).toHaveBeenCalledWith("[AuthEmail] delivery skipped", {
			purpose,
			status: "skipped",
			reason: "not_configured",
		});
		expect(JSON.stringify(warn.mock.calls)).not.toContain("example.com");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
		warn.mockRestore();
	});

	it.each(callbackCases)(
		"keeps $purpose transport failures from escaping the callback",
		async ({ purpose, invoke }) => {
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			sendEmailMock.mockResolvedValueOnce({
				status: "failed",
				purpose,
				reason: "transport_error",
				message: "SMTP transport failed",
				errorCode: "EAUTH",
				responseCode: 535,
				latencyMs: 1,
			});

			await expect(invoke()).resolves.toBeUndefined();

			expect(error).toHaveBeenCalledWith("[AuthEmail] delivery failed", {
				purpose,
				status: "failed",
				reason: "transport_error",
				errorCode: "EAUTH",
				responseCode: 535,
			});
			expect(JSON.stringify(error.mock.calls)).not.toContain("example.com");
			expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
			error.mockRestore();
		},
	);

	it("contains unexpected callback errors to preserve unauthenticated response consistency", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		sendEmailMock.mockRejectedValueOnce(new Error("SMTP internals"));

		await expect(
			callbacks.emailAndPassword.sendResetPassword({
				user: { email: "person@example.com" },
				url: "https://example.com/reset?token=secret",
			}),
		).resolves.toBeUndefined();

		expect(error).toHaveBeenCalledWith("[AuthEmail] delivery failed", {
			purpose: "password_reset",
			status: "failed",
			reason: "transport_error",
		});
		error.mockRestore();
	});
});
