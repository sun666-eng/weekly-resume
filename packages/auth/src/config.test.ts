import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@reactive-resume/env/server";
import { auth } from "./config";
import { createAuthEmailCallbacks } from "./email-callbacks";
import { createEmailOtpPlugin } from "./email-otp";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/email/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("@reactive-resume/email/transport")>()),
	sendEmail: sendEmailMock,
}));

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

const installed = auth.options.plugins.find((plugin) => plugin.id === "email-otp");
if (!installed || !("options" in installed)) throw new Error("email-otp is missing");
const otpOptions = installed.options as ReturnType<typeof createEmailOtpPlugin>["options"];

it.each([
	[false, false],
	[true, false],
	[false, true],
	[true, true],
])("configures hashed codes and gates signup for flags %s/%s", (disableEmail, disableSignups) => {
	const plugin = createEmailOtpPlugin(
		{ FLAG_DISABLE_EMAIL_AUTH: disableEmail, FLAG_DISABLE_SIGNUPS: disableSignups },
		createAuthEmailCallbacks(),
	);
	expect(plugin.options).toMatchObject({
		disableSignUp: disableEmail || disableSignups,
		otpLength: 6,
		expiresIn: 600,
		allowedAttempts: 5,
		storeOTP: "hashed",
		overrideDefaultEmailVerification: false,
		sendVerificationOnSignUp: false,
	});
	expect(otpOptions.storeOTP).toBe("hashed");
});

const callbackCases = [
	...(["sign-in", "forget-password"] as const).map((type) => ({
		purpose: type === "sign-in" ? "sign_in_otp" : "password_reset_otp",
		invoke: () => otpOptions.sendVerificationOTP({ type, email: "person@example.com", otp: "031628" }),
	})),
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
		expect(JSON.stringify(warn.mock.calls)).not.toContain("031628");
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
				responseCode: 535,
				...(!purpose.endsWith("_otp") && { errorCode: "EAUTH" }),
			});
			expect(JSON.stringify(error.mock.calls)).not.toContain("031628");
			expect(JSON.stringify(error.mock.calls)).not.toContain("example.com");
			expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
			error.mockRestore();
		},
	);

	it.each([99, 600, 535.5, 123456, "535"])("omits an invalid OTP delivery responseCode (%s)", async (responseCode) => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			sendEmailMock.mockResolvedValueOnce({
				status: "failed",
				purpose: "sign_in_otp",
				reason: "transport_error",
				message: "person@example.com 123456",
				errorCode: "E123456",
				command: "AUTH LOGIN",
				responseCode,
			});
			await otpOptions.sendVerificationOTP({ type: "sign-in", email: "person@example.com", otp: "123456" });
			expect(error).toHaveBeenCalledExactlyOnceWith("[AuthEmail] delivery failed", {
				purpose: "sign_in_otp",
				status: "failed",
				reason: "transport_error",
			});
		} finally {
			error.mockRestore();
		}
	});

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
