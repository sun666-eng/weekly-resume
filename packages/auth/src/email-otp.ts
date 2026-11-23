import type { GenericEndpointContext } from "better-auth";
import type { createAuthEmailCallbacks } from "./email-callbacks";
import { APIError } from "better-auth";
import { deleteSessionCookie } from "better-auth/cookies";
import { emailOTP } from "better-auth/plugins";
import { allocateUniqueUsername } from "./username-allocation";

export function createEmailOtpPlugin(
	flags: { FLAG_DISABLE_EMAIL_AUTH: boolean; FLAG_DISABLE_SIGNUPS: boolean },
	callbacks: ReturnType<typeof createAuthEmailCallbacks>,
) {
	return emailOTP({
		otpLength: 6,
		expiresIn: 600,
		allowedAttempts: 5,
		storeOTP: "hashed",
		disableSignUp: flags.FLAG_DISABLE_EMAIL_AUTH || flags.FLAG_DISABLE_SIGNUPS,
		overrideDefaultEmailVerification: false,
		sendVerificationOnSignUp: false,
		sendVerificationOTP: callbacks.sendVerificationOTP,
	});
}

const signInPath = "/sign-in/email-otp";
const supportedPaths = new Set([
	signInPath,
	"/email-otp/send-verification-otp",
	"/email-otp/request-password-reset",
	"/email-otp/reset-password",
]);

export async function prepareEmailOtpRequest(
	ctx: GenericEndpointContext,
	disableEmailAuth: boolean,
	disableSignups: boolean,
) {
	if (!ctx.path?.startsWith("/email-otp/") && ctx.path !== signInPath && ctx.path !== "/forget-password/email-otp")
		return;
	if (
		disableEmailAuth ||
		!supportedPaths.has(ctx.path) ||
		(ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type !== "sign-in")
	) {
		throw new APIError("FORBIDDEN", { message: "Email authentication method unavailable." });
	}
	if (typeof ctx.body?.email !== "string") return;
	const email = ctx.body.email.trim().toLowerCase();
	ctx.body.email = email;
	if (ctx.path !== signInPath || disableSignups || (await ctx.context.internalAdapter.findUserByEmail(email))) return;

	const username = await allocateUniqueUsername(
		email,
		async (candidate) =>
			Boolean(
				await ctx.context.adapter.findOne({
					model: "user",
					where: [
						{ field: "username", value: candidate, connector: "OR", mode: "insensitive" },
						{ field: "displayUsername", value: candidate, connector: "OR", mode: "insensitive" },
					],
				}),
			),
		typeof ctx.body.username === "string" ? ctx.body.username : undefined,
	);
	ctx.body.username = username;
	ctx.body.displayUsername = username;
	ctx.body.name = (typeof ctx.body.name === "string" && ctx.body.name.trim()) || email.split("@")[0] || username;
}

export async function enforceEmailOtpTwoFactor(ctx: GenericEndpointContext) {
	const issued = ctx.context.newSession;
	if (
		ctx.path !== signInPath ||
		!issued ||
		!("twoFactorEnabled" in issued.user) ||
		issued.user.twoFactorEnabled !== true
	)
		return;
	await ctx.context.internalAdapter.deleteSession(issued.session.token);
	// Endpoint cookies and after-hook cookies are accumulated separately by Better Auth.
	if ("responseHeaders" in ctx.context && ctx.context.responseHeaders instanceof Headers)
		ctx.context.responseHeaders.delete("set-cookie");
	ctx.responseHeaders?.delete("set-cookie");
	deleteSessionCookie(ctx, true);
	ctx.context.setNewSession(null);
	throw twoFactorRequired();
}

// An unverified account is normally promoted by removing its unproven credentials.
// Keep the password available for the required two-factor sign-in instead.
// Better Auth reaches this hook only after consuming a correct sign-in OTP.
export async function protectTwoFactorCredentials(account: { userId: string }, ctx: GenericEndpointContext | null) {
	if (ctx?.path !== signInPath) return;
	const user = await ctx.context.internalAdapter.findUserById(account.userId);
	if (user && "twoFactorEnabled" in user && user.twoFactorEnabled === true) throw twoFactorRequired();
}

function twoFactorRequired() {
	return new APIError("FORBIDDEN", {
		code: "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP",
		message: "Two-factor authentication is enabled on this account. Please sign in with your password.",
	});
}
