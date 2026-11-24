import type { SendEmailOptions, SendEmailResult } from "@reactive-resume/email/transport";
import type { MemoryDB } from "better-auth/adapters/memory";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { twoFactor, username } from "better-auth/plugins";
import { rateLimitConfig } from "@reactive-resume/utils/rate-limit";
import { createAuthEmailCallbacks } from "./email-callbacks";
import {
	createEmailOtpPlugin,
	enforceEmailOtpTwoFactor,
	prepareEmailOtpRequest,
	protectTwoFactorCredentials,
} from "./email-otp";

const origin = "http://localhost:3000";
const email = "member@example.test";
const initialPassword = "initial-passphrase";
const nextPassword = "updated-passphrase";
const sendPath = "/email-otp/send-verification-otp";
const signInPath = "/sign-in/email-otp";
const requestResetPath = "/email-otp/request-password-reset";
const resetPath = "/email-otp/reset-password";
const sensitive = new Set<string>();
let ip = 10;

beforeEach(() => {
	sensitive.clear();
	for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

afterEach(() => {
	try {
		const logs = JSON.stringify([
			vi.mocked(console.info).mock.calls,
			vi.mocked(console.warn).mock.calls,
			vi.mocked(console.error).mock.calls,
		]);
		for (const value of sensitive) expect(logs).not.toContain(value);
	} finally {
		vi.restoreAllMocks();
	}
});

function setup({ disableEmail = false, disableSignups = false, limited = false } = {}) {
	const db: MemoryDB = { user: [], verification: [], session: [], account: [], twoFactor: [] };
	const send = vi.fn<(options: SendEmailOptions) => Promise<SendEmailResult>>().mockImplementation(async (options) => ({
		status: "accepted",
		purpose: options.purpose ?? "generic",
		accepted: [],
		rejected: [],
		latencyMs: 1,
	}));
	const auth = betterAuth({
		baseURL: origin,
		secret: "isolated-memory-test-secret-with-sufficient-length",
		database: memoryAdapter(db),
		telemetry: { enabled: false },
		rateLimit: { ...rateLimitConfig.betterAuth.global, enabled: limited },
		emailAndPassword: { enabled: !disableEmail, autoSignIn: false, minPasswordLength: 8, maxPasswordLength: 64 },
		user: { additionalFields: { username: { type: "string", required: true } } },
		plugins: [
			createEmailOtpPlugin(
				{ FLAG_DISABLE_EMAIL_AUTH: disableEmail, FLAG_DISABLE_SIGNUPS: disableSignups },
				createAuthEmailCallbacks((options) => {
					const otp = options.text?.match(/^\d{6}$/m)?.[0];
					if (otp) sensitive.add(otp);
					return send(options);
				}),
			),
			twoFactor(),
			username({
				minUsernameLength: 3,
				maxUsernameLength: 64,
				usernameValidator: (value) => /^[a-z0-9._-]+$/.test(value),
			}),
		],
		databaseHooks: { account: { delete: { before: protectTwoFactorCredentials } } },
		hooks: {
			before: createAuthMiddleware((ctx) => prepareEmailOtpRequest(ctx, disableEmail, disableSignups)),
			after: createAuthMiddleware(enforceEmailOtpTwoFactor),
		},
	});
	const testIp = `192.0.2.${ip++}`;
	const post = (path: string, body: Record<string, string>) => {
		if (body.email) sensitive.add(body.email.trim().toLowerCase());
		return auth.handler(
			new Request(`${origin}/api/auth${path}`, {
				method: "POST",
				headers: { origin, "content-type": "application/json", "x-forwarded-for": testIp },
				body: JSON.stringify(body),
			}),
		);
	};
	const issue = async (address = email, reset = false) => {
		const response = await (reset
			? post(requestResetPath, { email: address })
			: post(sendPath, { email: address, type: "sign-in" }));
		expect(response.status).toBe(200);
		const mail = send.mock.calls.at(-1)?.[0];
		expect(mail).toMatchObject({
			to: address.trim().toLowerCase(),
			purpose: reset ? "password_reset_otp" : "sign_in_otp",
		});
		const otp = mail?.text?.match(/^\d{6}$/m)?.[0];
		if (!otp) throw new Error("Missing six-digit code in captured delivery");
		sensitive.add(otp);
		return otp;
	};
	const register = async () => {
		expect(
			(await post("/sign-up/email", { email, username: "member", name: "Member", password: initialPassword })).status,
		).toBe(200);
	};
	return { auth, db, send, post, issue, register };
}

it("creates a verified account and usable cookie only after consuming the hashed code", async () => {
	const { auth, db, post, issue } = setup();
	const otp = await issue("  Member@Example.Test ");
	expect(db.user).toHaveLength(0);
	expect(db.verification?.[0]).toMatchObject({ value: `${createHash("sha256").update(otp).digest("base64url")}:0` });
	const response = await post(signInPath, { email: " Member@Example.Test ", otp });
	expect(response.status).toBe(200);
	expect(db.user).toHaveLength(1);
	expect(db.user?.[0]).toMatchObject({
		email,
		emailVerified: true,
		username: "member",
		displayUsername: "member",
		name: "member",
	});
	const cookie = response.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ");
	const session = await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }));
	expect(await session.json()).toMatchObject({ user: { email } });
	expect(await (await post(signInPath, { email, otp })).json()).toMatchObject({ code: "INVALID_OTP" });
});

it("allocates valid distinct usernames for short and colliding email prefixes", async () => {
	const { db, post, issue } = setup();
	for (const address of ["ab@one.test", "ab@two.test", "ab@three.test"]) {
		const result = await post(signInPath, { email: address, otp: await issue(address) });
		expect(result.status, result.ok ? undefined : (await result.json()).code).toBe(200);
	}
	expect(db.user?.map((user) => user.username)).toEqual(["user-ab", "user-ab-1", "user-ab-2"]);
});

it("also avoids a legacy display username when allocating a new login", async () => {
	const { db, register, post, issue } = setup();
	await register();
	Object.assign(db.user?.[0] ?? {}, { displayUsername: "CaseName" });
	const address = "casename@example.test";
	expect((await post(signInPath, { email: address, otp: await issue(address) })).status).toBe(200);
	expect(db.user?.[1]).toMatchObject({ username: "casename-1", displayUsername: "casename-1" });
});

it("promotes an existing unverified user without creating a duplicate", async () => {
	const { db, register, post, issue } = setup();
	await register();
	expect(db.user?.[0]?.emailVerified).toBe(false);
	const id = db.user?.[0]?.id;
	expect((await post(signInPath, { email, otp: await issue() })).status).toBe(200);
	expect(db.user).toHaveLength(1);
	expect(db.user?.[0]).toMatchObject({ id, emailVerified: true });
});

it("requires password and two-factor verification after a valid code for an enrolled user", async () => {
	const { db, register, post, issue } = setup();
	await register();
	Object.assign(db.user?.[0] ?? {}, { emailVerified: true, twoFactorEnabled: true });
	const otp = await issue();
	const invalid = await post(signInPath, { email, otp: "invalid" });
	expect(await invalid.json()).toMatchObject({ code: "INVALID_OTP" });
	const response = await post(signInPath, { email, otp });
	expect(response.status).toBe(403);
	expect(await response.json()).toMatchObject({ code: "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP" });
	const cookies = response.headers.getSetCookie();
	expect(cookies.some((cookie) => cookie.includes("session_token="))).toBe(true);
	for (const cookie of cookies) expect(cookie).toMatch(/Max-Age=0/i);
	expect(db.session).toHaveLength(0);
});

it("preserves the password for an unverified two-factor account when directing it to password sign-in", async () => {
	const { db, register, post, issue } = setup();
	await register();
	Object.assign(db.user?.[0] ?? {}, { twoFactorEnabled: true });
	const accounts = structuredClone(db.account);
	const response = await post(signInPath, { email, otp: await issue() });
	expect(response.status).toBe(403);
	expect(await response.json()).toMatchObject({ code: "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP" });
	expect(db.account).toEqual(accounts);
	expect(db.session).toHaveLength(0);
	expect(response.headers.getSetCookie()).toHaveLength(0);
});

it("keeps signup-disabled requests conditional and does not create an unknown user", async () => {
	const { post, send, db, register, issue } = setup({ disableSignups: true });
	const absent = await post(sendPath, { email: "absent@example.test", type: "sign-in" });
	expect(absent.status).toBe(200);
	expect(send).not.toHaveBeenCalled();
	expect(await (await post(signInPath, { email: "absent@example.test", otp: "123456" })).json()).toMatchObject({
		code: "INVALID_OTP",
	});
	expect(db.user).toHaveLength(0);
	await register();
	expect((await post(signInPath, { email, otp: await issue() })).status).toBe(200);
	expect(await absent.json()).toEqual({ success: true });
});

it("rejects every OTP entry point when email auth is disabled", async () => {
	const { post, send, db } = setup({ disableEmail: true });
	for (const path of [
		sendPath,
		signInPath,
		requestResetPath,
		resetPath,
		"/forget-password/email-otp",
		"/email-otp/check-verification-otp",
		"/email-otp/verify-email",
		"/email-otp/request-email-change",
		"/email-otp/change-email",
	]) {
		const result = await post(path, {
			email,
			newEmail: "changed@example.test",
			otp: "000000",
			type: "sign-in",
			password: nextPassword,
		});
		expect(result.status, path).toBe(403);
	}
	expect(send).not.toHaveBeenCalled();
	expect(db.verification).toHaveLength(0);
});

it.each(["accepted", "failed", "skipped", "throws"] as const)(
	"returns an identical reset response for known and unknown email on %s delivery",
	async (status) => {
		const { post, send, register } = setup();
		await register();
		const absent = await post(requestResetPath, { email: "absent@example.test" });
		expect(send).not.toHaveBeenCalled();
		if (status === "throws") send.mockRejectedValueOnce(new Error(email));
		if (status === "skipped")
			send.mockResolvedValueOnce({ status, purpose: "password_reset_otp", reason: "not_configured" });
		if (status === "failed")
			send.mockResolvedValueOnce({
				status,
				purpose: "password_reset_otp",
				reason: "transport_error",
				message: email,
				latencyMs: 1,
			});
		const known = await post(requestResetPath, { email });
		expect(send).toHaveBeenCalledTimes(1);
		const otp = send.mock.calls[0]?.[0].text?.match(/^\d{6}$/m)?.[0];
		if (!otp) throw new Error("Missing reset code");
		sensitive.add(otp);
		expect(absent.status).toBe(200);
		expect(known.status).toBe(200);
		expect(await known.text()).toBe(await absent.text());
		if (status !== "accepted")
			expect(status === "skipped" ? console.warn : console.error).toHaveBeenCalledWith(
				expect.stringContaining("[AuthEmail]"),
				expect.objectContaining({ purpose: "password_reset_otp" }),
			);
	},
);

it.each([false, true])("sets a password using a one-time code (passwordless account: %s)", async (passwordless) => {
	const { register, db, issue, post } = setup();
	if (passwordless) {
		expect((await post(signInPath, { email, otp: await issue() })).status).toBe(200);
		expect(db.account).toHaveLength(0);
	} else await register();
	const otp = await issue(email, true);
	expect((await post(resetPath, { email, otp, password: nextPassword })).status).toBe(200);
	expect(await (await post(resetPath, { email, otp, password: initialPassword })).json()).toMatchObject({
		code: "INVALID_OTP",
	});
	expect((await post("/sign-in/email", { email, password: initialPassword })).status).toBe(401);
	expect((await post("/sign-in/email", { email, password: nextPassword })).status).toBe(200);
});

it("enforces five attempts, invalidates exhausted codes, and distinguishes expiration", async () => {
	const { db, post, issue } = setup();
	const otp = await issue();
	const wrong = otp === "000000" ? "000001" : "000000";
	for (let attempt = 0; attempt < 5; attempt++) {
		expect(await (await post(signInPath, { email, otp: wrong })).json()).toMatchObject({ code: "INVALID_OTP" });
	}
	expect(await (await post(signInPath, { email, otp })).json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
	expect(await (await post(signInPath, { email, otp })).json()).toMatchObject({ code: "INVALID_OTP" });
	const fresh = await issue();
	Object.assign(db.verification?.[0] ?? {}, { expiresAt: new Date(Date.now() - 1000) });
	expect(await (await post(signInPath, { email, otp: fresh })).json()).toMatchObject({ code: "OTP_EXPIRED" });
});

it("returns the retry header after five sends in the ten-minute window", async () => {
	const { post } = setup({ limited: true });
	for (let i = 0; i < 5; i++) expect((await post(sendPath, { email, type: "sign-in" })).status).toBe(200);
	const limited = await post(sendPath, { email: "other@example.test", type: "sign-in" });
	expect(limited.status).toBe(429);
	expect(Number(limited.headers.get("X-Retry-After"))).toBeGreaterThan(590);
});
