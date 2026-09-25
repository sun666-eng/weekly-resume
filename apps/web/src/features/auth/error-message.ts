import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type AuthError = {
	code?: unknown;
	message?: unknown;
};

// Descriptors resolve through i18n at call time, so this module-scope map still follows the
// active locale instead of freezing the source-locale string at import.
const authErrorMessages: Record<string, MessageDescriptor> = {
	USER_NOT_FOUND: msg`No account found for this email or username.`,
	INVALID_EMAIL: msg`The email address is not valid.`,
	INVALID_PASSWORD: msg`Incorrect password. Please try again.`,
	INVALID_EMAIL_OR_PASSWORD: msg`Incorrect email, username, or password.`,
	INVALID_USER: msg`Invalid account. Please sign in again.`,
	EMAIL_NOT_VERIFIED: msg`Your email is not verified yet. Please verify it first.`,
	PASSWORD_TOO_SHORT: msg`Password must be at least 8 characters.`,
	PASSWORD_TOO_LONG: msg`Password must be at most 64 characters.`,
	USER_ALREADY_EXISTS: msg`This email is already registered. Please sign in.`,
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: msg`This email is already registered. Please sign in or use another email.`,
	INVALID_TOKEN: msg`This link is invalid. Please request a new one.`,
	TOKEN_EXPIRED: msg`This link has expired. Please request a new one.`,
	SESSION_EXPIRED: msg`Your session has expired. Please sign in again.`,
	INVALID_CODE: msg`Incorrect verification code. Please try again.`,
	INVALID_BACKUP_CODE: msg`Incorrect backup code. Please try again.`,
	OTP_HAS_EXPIRED: msg`This verification code has expired. Please request a new one.`,
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: msg`Too many attempts. Please request a new code.`,
	ACCOUNT_TEMPORARILY_LOCKED: msg`Too many failed attempts. Your account is temporarily locked. Please try again later.`,
};

const authMessageCodes: Record<string, string> = {
	"User already exists.": "USER_ALREADY_EXISTS",
	"User already exists. Use another email.": "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"Invalid email or password": "INVALID_EMAIL_OR_PASSWORD",
	"Invalid password": "INVALID_PASSWORD",
	"Email not verified": "EMAIL_NOT_VERIFIED",
	"Password too short": "PASSWORD_TOO_SHORT",
	"Password too long": "PASSWORD_TOO_LONG",
	"Invalid token": "INVALID_TOKEN",
	"Token expired": "TOKEN_EXPIRED",
};

export function getAuthErrorMessage(error: unknown, fallback: string): string {
	if (typeof error !== "object" || error === null) return fallback;

	const { code, message } = error as AuthError;
	if (typeof code === "string" && authErrorMessages[code]) return i18n._(authErrorMessages[code]);

	if (typeof message === "string") {
		const mappedCode = authMessageCodes[message];
		if (mappedCode && authErrorMessages[mappedCode]) return i18n._(authErrorMessages[mappedCode]);
	}

	return fallback;
}
