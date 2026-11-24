import type { SendEmailOptions, SendEmailResult } from "@reactive-resume/email/transport";
import type { MemoryDB } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthEmailCallbacks } from "./email-callbacks";

const baseUrl = "http://localhost:3000";
const password = "InitialPassword123!";
const email = "reset-user@example.test";
let nextTestIp = 40;

function createTestAuth(send: (options: SendEmailOptions) => Promise<SendEmailResult>, maxResetRequests = 20) {
	const database: MemoryDB = { user: [], session: [], account: [], verification: [] };
	const testIp = `192.0.2.${nextTestIp++}`;
	const callbacks = createAuthEmailCallbacks(send);
	const auth = betterAuth({
		baseURL: baseUrl,
		secret: "test-secret-that-is-long-enough-for-better-auth",
		database: memoryAdapter(database),
		trustedOrigins: [baseUrl],
		rateLimit: {
			enabled: maxResetRequests !== 20,
			window: 600,
			max: 20,
			customRules: { "/request-password-reset": { window: 600, max: maxResetRequests } },
		},
		emailAndPassword: {
			enabled: true,
			autoSignIn: false,
			requireEmailVerification: false,
			minPasswordLength: 8,
			maxPasswordLength: 64,
			sendResetPassword: callbacks.sendResetPassword,
		},
		emailVerification: {
			sendOnSignUp: true,
			sendVerificationEmail: callbacks.sendVerificationEmail,
		},
	});

	return {
		auth,
		database,
		request: (path: string, body?: unknown, method = "POST") =>
			new Request(`${baseUrl}/api/auth${path}`, {
				method,
				headers: {
					origin: baseUrl,
					"x-forwarded-for": testIp,
					...(body === undefined ? {} : { "content-type": "application/json" }),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				redirect: "manual",
			}),
	};
}

type TestAuth = ReturnType<typeof createTestAuth>["auth"];

async function registerUser(auth: TestAuth) {
	const response = await auth.handler(
		new Request(`${baseUrl}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { origin: baseUrl, "content-type": "application/json", "x-forwarded-for": `192.0.2.${nextTestIp++}` },
			body: JSON.stringify({ name: "Reset User", email, password }),
		}),
	);
	expect(response.status).toBe(200);
}

function resetRequest(auth: TestAuth, targetEmail: string, request: ReturnType<typeof createTestAuth>["request"]) {
	return auth.handler(
		request("/request-password-reset", {
			email: targetEmail,
			redirectTo: `${baseUrl}/auth/reset-password`,
		}),
	);
}

function acceptedResult(purpose: SendEmailOptions["purpose"]): SendEmailResult {
	return {
		status: "accepted",
		purpose: purpose ?? "generic",
		messageId: "<local-test@example.test>",
		accepted: [email],
		rejected: [],
		latencyMs: 1,
	};
}

describe("Better Auth password reset and verification HTTP flow", () => {
	let send: ReturnType<typeof vi.fn<(options: SendEmailOptions) => Promise<SendEmailResult>>>;
	let auth: TestAuth;
	let database: MemoryDB;
	let request: ReturnType<typeof createTestAuth>["request"];

	beforeEach(async () => {
		send = vi.fn(async (options: SendEmailOptions) => acceptedResult(options.purpose));
		({ auth, database, request } = createTestAuth(send));
		await registerUser(auth);
		send.mockClear();
	});

	it("returns the same conditional response for absent and registered addresses when email is accepted", async () => {
		const absentResponse = await resetRequest(auth, "absent@example.test", request);
		const registeredResponse = await resetRequest(auth, email, request);

		expect(absentResponse.status).toBe(200);
		expect(registeredResponse.status).toBe(200);
		const absentBody = await absentResponse.json();
		const registeredBody = await registeredResponse.json();
		expect(absentBody).toEqual(registeredBody);
		expect(registeredBody).toEqual({
			status: true,
			message: "If this email exists in our system, check your email for the reset link",
		});
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ purpose: "password_reset" }));
	});

	it.each([
		[
			"SMTP configuration is missing",
			{ status: "skipped", purpose: "password_reset", reason: "not_configured" },
			"warn",
		],
		[
			"SMTP rejects the message",
			{
				status: "failed",
				purpose: "password_reset",
				reason: "rejected",
				message: "SMTP rejected the message",
				rejected: [email],
				latencyMs: 1,
			},
			"error",
		],
		[
			"SMTP transport fails",
			{
				status: "failed",
				purpose: "password_reset",
				reason: "transport_error",
				message: "SMTP transport failed",
				errorCode: "ECONNREFUSED",
				latencyMs: 1,
			},
			"error",
		],
	] as const)("keeps the response indistinguishable when %s", async (_label, result, logLevel) => {
		const log = vi.spyOn(console, logLevel).mockImplementation(() => {});
		send.mockResolvedValueOnce(result as SendEmailResult);
		const absentResponse = await resetRequest(auth, "absent@example.test", request);
		const registeredResponse = await resetRequest(auth, email, request);

		expect(absentResponse.status).toBe(200);
		expect(registeredResponse.status).toBe(200);
		const absentBody = await absentResponse.json();
		const registeredBody = await registeredResponse.json();
		expect(absentBody).toEqual(registeredBody);
		expect(log).toHaveBeenCalledWith(
			logLevel === "warn" ? "[AuthEmail] delivery skipped" : "[AuthEmail] delivery failed",
			expect.objectContaining({ purpose: "password_reset", status: result.status }),
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain(email);
		log.mockRestore();
	});

	it("keeps the conditional reset response when the sender throws", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		send.mockRejectedValueOnce(new Error("private SMTP details"));
		const absentResponse = await resetRequest(auth, "absent@example.test", request);
		const registeredResponse = await resetRequest(auth, email, request);

		expect(absentResponse.status).toBe(200);
		expect(registeredResponse.status).toBe(200);
		const absentBody = await absentResponse.json();
		const registeredBody = await registeredResponse.json();
		expect(absentBody).toEqual(registeredBody);
		expect(error).toHaveBeenCalledWith("[AuthEmail] delivery failed", {
			purpose: "password_reset",
			status: "failed",
			reason: "transport_error",
		});
		error.mockRestore();
	});

	it("keeps unauthenticated verification resend responses equal when SMTP throws", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		send.mockRejectedValueOnce(new Error("private SMTP details"));
		const unknownResponse = await auth.handler(request("/send-verification-email", { email: "absent@example.test" }));
		const registeredResponse = await auth.handler(request("/send-verification-email", { email }));

		expect(unknownResponse.status).toBe(200);
		expect(registeredResponse.status).toBe(200);
		expect(await unknownResponse.json()).toEqual(await registeredResponse.json());
		expect(error).toHaveBeenCalledWith("[AuthEmail] delivery failed", {
			purpose: "email_verification",
			status: "failed",
			reason: "transport_error",
		});
		expect(JSON.stringify(error.mock.calls)).not.toContain(email);
		expect(JSON.stringify(error.mock.calls)).not.toContain("private SMTP details");
		error.mockRestore();
	});

	it("returns a 429 response with X-Retry-After after the configured request limit", async () => {
		const limited = createTestAuth(send, 1);
		const first = await limited.auth.handler(
			limited.request("/request-password-reset", { email: "absent@example.test" }),
		);
		const second = await limited.auth.handler(
			limited.request("/request-password-reset", { email: "absent@example.test" }),
		);

		expect(first.status).toBe(200);
		expect(second.status).toBe(429);
		expect(second.headers.get("X-Retry-After")).toBe("600");
		expect(await second.json()).toEqual({ message: "Too many requests. Please try again later." });
	});

	it("resets a password once and rejects reuse of the same credential", async () => {
		const response = await resetRequest(auth, email, request);
		expect(response.status).toBe(200);
		const resetLink = send.mock.calls[0]?.[0].text?.match(/https?:\/\/\S+/)?.[0];
		if (!resetLink) throw new Error("The reset email callback did not provide a link.");
		const resetUrl = new URL(resetLink);
		const token = resetUrl.pathname.split("/").at(-1);
		if (!token) throw new Error("The reset email link did not contain a token.");

		const callback = await auth.handler(
			request(
				`/reset-password/${token}?callbackURL=${encodeURIComponent(`${baseUrl}/auth/reset-password`)}`,
				undefined,
				"GET",
			),
		);
		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toContain(`${baseUrl}/auth/reset-password?token=${token}`);

		const resetBody = { token, newPassword: "UpdatedPassword123!" };
		const firstReset = await auth.handler(request("/reset-password", resetBody));
		const repeatedReset = await auth.handler(request("/reset-password", resetBody));
		expect(firstReset.status).toBe(200);
		expect(repeatedReset.status).toBe(400);
		expect(await repeatedReset.json()).toMatchObject({ code: "INVALID_TOKEN" });
	});

	it("redirects invalid and expired reset links with an in-place recovery error", async () => {
		const invalid = await auth.handler(
			request(
				`/reset-password/not-a-token?callbackURL=${encodeURIComponent(`${baseUrl}/auth/reset-password`)}`,
				undefined,
				"GET",
			),
		);
		expect(invalid.status).toBe(302);
		expect(invalid.headers.get("location")).toBe(`${baseUrl}/auth/reset-password?error=INVALID_TOKEN`);

		await resetRequest(auth, email, request);
		const resetLink = send.mock.calls.at(-1)?.[0].text?.match(/https?:\/\/\S+/)?.[0];
		if (!resetLink) throw new Error("The reset email callback did not provide a link.");
		const resetUrl = new URL(resetLink);
		const token = resetUrl.pathname.split("/").at(-1);
		if (!token) throw new Error("The reset email link did not contain a token.");
		const verification = database.verification?.find((value) => {
			return (value as { identifier?: string }).identifier === `reset-password:${token}`;
		}) as { expiresAt: Date } | undefined;
		expect(verification).toBeDefined();
		if (verification) verification.expiresAt = new Date(Date.now() - 1_000);

		const expired = await auth.handler(
			request(
				`/reset-password/${token}?callbackURL=${encodeURIComponent(`${baseUrl}/auth/reset-password`)}`,
				undefined,
				"GET",
			),
		);
		expect(expired.status).toBe(302);
		expect(expired.headers.get("location")).toBe(`${baseUrl}/auth/reset-password?error=INVALID_TOKEN`);
	});
});
