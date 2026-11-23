import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { ORPCError } from "@orpc/client";

/* ------------------------------------------------------------------ */
/* Better Auth errors                                                  */
/* ------------------------------------------------------------------ */

type AuthError = {
	code?: unknown;
	message?: unknown;
	status?: unknown;
	retryAfterSeconds?: unknown;
};

// Descriptors resolve through i18n at call time, so this module-scope map still follows the
// active locale instead of freezing the source-locale string at import.
const authErrorMessages: Record<string, MessageDescriptor> = {
	USER_NOT_FOUND: msg`No account found for this email or username.`,
	INVALID_EMAIL: msg`The email address is not valid.`,
	INVALID_PASSWORD: msg`Incorrect password. Please try again.`,
	INVALID_EMAIL_OR_PASSWORD: msg`Incorrect email, username, or password.`,
	INVALID_USERNAME_OR_PASSWORD: msg`Incorrect username or password.`,
	INVALID_USER: msg`Invalid account. Please sign in again.`,
	EMAIL_NOT_VERIFIED: msg`Your email is not verified yet. Please verify it first.`,
	PASSWORD_TOO_SHORT: msg`Password must be at least 8 characters.`,
	PASSWORD_TOO_LONG: msg`Password must be at most 64 characters.`,
	USER_ALREADY_EXISTS: msg`This email is already registered. Please sign in.`,
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: msg`This email is already registered. Please sign in or use another email.`,
	INVALID_TOKEN: msg`This link is invalid. Please request a new one.`,
	TOKEN_EXPIRED: msg`This link has expired. Please request a new one.`,
	SESSION_EXPIRED: msg`Your session has expired. Please sign in again.`,
	INVALID_OTP: msg`Incorrect verification code. Please try again.`,
	OTP_EXPIRED: msg`This verification code has expired. Please request a new one.`,
	TOO_MANY_ATTEMPTS: msg`Too many attempts. Please request a new code.`,
	TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP: msg`This account uses two-factor authentication. Sign in with your password and complete two-factor verification.`,
	INVALID_CODE: msg`Incorrect verification code. Please try again.`,
	INVALID_BACKUP_CODE: msg`Incorrect backup code. Please try again.`,
	OTP_HAS_EXPIRED: msg`This verification code has expired. Please request a new one.`,
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: msg`Too many attempts. Please request a new code.`,
	ACCOUNT_TEMPORARILY_LOCKED: msg`Too many failed attempts. Your account is temporarily locked. Please try again later.`,
	TOO_MANY_REQUESTS: msg`Too many requests. Please try again later.`,
	USERNAME_IS_ALREADY_TAKEN: msg`This username is already taken.`,
	CREDENTIAL_ACCOUNT_NOT_FOUND: msg`Account not found, or it has no password set.`,
	FAILED_TO_CREATE_USER: msg`Failed to create your account. Please try again.`,
	FAILED_TO_CREATE_SESSION: msg`Failed to sign you in. Please try again.`,
	FAILED_TO_UPDATE_USER: msg`Failed to update your account. Please try again.`,
	SOCIAL_ACCOUNT_ALREADY_LINKED: msg`This social account is already linked to another user.`,
	VERIFICATION_EMAIL_NOT_ENABLED: msg`Email verification is not enabled on this instance.`,
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: msg`This passkey cannot be registered in this environment.`,
	PREVIOUSLY_REGISTERED: msg`This passkey is already registered.`,
};

const authMessageCodes: Record<string, string> = {
	"User already exists.": "USER_ALREADY_EXISTS",
	"User already exists. Use another email.": "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"Invalid email or password": "INVALID_EMAIL_OR_PASSWORD",
	"Invalid password": "INVALID_PASSWORD",
	"Email not verified": "EMAIL_NOT_VERIFIED",
	"Password too short": "PASSWORD_TOO_SHORT",
	"Password too long": "PASSWORD_TOO_LONG",
	"Invalid OTP": "INVALID_OTP",
	"OTP expired": "OTP_EXPIRED",
	"Too many attempts": "TOO_MANY_ATTEMPTS",
	"Two-factor authentication is enabled on this account. Please sign in with your password.":
		"TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP",
	"Invalid token": "INVALID_TOKEN",
	"Token expired": "TOKEN_EXPIRED",
};

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
	if (!value) return;
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		const seconds = Number(trimmed);
		return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
	}

	const timestamp = Date.parse(trimmed);
	if (!Number.isFinite(timestamp)) return;
	const seconds = Math.ceil((timestamp - now) / 1000);
	return seconds > 0 ? seconds : undefined;
}

export function getRetryAfterSeconds(headers: { get(name: string): string | null } | undefined): number | undefined {
	if (!headers) return;
	return parseRetryAfter(headers.get("X-Retry-After")) ?? parseRetryAfter(headers.get("Retry-After"));
}

function getAuthErrorStatus(error: AuthError): number | undefined {
	if (typeof error.status === "number") return error.status;
	if (typeof error.status === "string" && /^\d+$/.test(error.status)) return Number(error.status);
	return undefined;
}

function getRetryAfterFromError(error: AuthError, explicit?: number): number | undefined {
	if (explicit !== undefined && Number.isSafeInteger(explicit) && explicit > 0) return explicit;
	if (
		typeof error.retryAfterSeconds === "number" &&
		Number.isSafeInteger(error.retryAfterSeconds) &&
		error.retryAfterSeconds > 0
	) {
		return error.retryAfterSeconds;
	}
	return undefined;
}

export function formatRetryAfterDuration(seconds: number): string {
	if (seconds < 60) return seconds === 1 ? t`1 second` : t`${seconds} seconds`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (remainingSeconds === 0) return minutes === 1 ? t`1 minute` : t`${minutes} minutes`;
	const minuteText = minutes === 1 ? t`1 minute` : t`${minutes} minutes`;
	const secondText = remainingSeconds === 1 ? t`1 second` : t`${remainingSeconds} seconds`;
	return t`${minuteText} ${secondText}`;
}

function getRateLimitMessage(seconds: number | undefined): string {
	if (seconds === undefined) return i18n._(authErrorMessages.TOO_MANY_REQUESTS);
	return t`Too many requests. Please try again in ${formatRetryAfterDuration(seconds)}.`;
}

export function resolveAuthErrorMessage(error: unknown, retryAfterSeconds?: number): string | null {
	if (typeof error !== "object" || error === null) return null;

	const authError = error as AuthError;
	const { code, message } = authError;
	const status = getAuthErrorStatus(authError);
	if (status === 429 || code === "TOO_MANY_REQUESTS" || message === "Too many requests. Please try again later.") {
		return getRateLimitMessage(getRetryAfterFromError(authError, retryAfterSeconds));
	}
	if (typeof code === "string" && authErrorMessages[code]) return i18n._(authErrorMessages[code]);

	if (typeof message === "string") {
		const mappedCode = authMessageCodes[message];
		if (mappedCode && authErrorMessages[mappedCode]) return i18n._(authErrorMessages[mappedCode]);
	}

	return null;
}

export function isAuthRateLimitError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const authError = error as AuthError;
	return (
		getAuthErrorStatus(authError) === 429 ||
		authError.code === "TOO_MANY_REQUESTS" ||
		authError.message === "Too many requests. Please try again later."
	);
}

export function isInvalidResetTokenError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const { code, message } = error as AuthError;
	return (
		code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED" || message === "Invalid token" || message === "Token expired"
	);
}

export function getAuthErrorMessage(error: unknown, fallback: string, retryAfterSeconds?: number): string {
	return resolveAuthErrorMessage(error, retryAfterSeconds) ?? fallback;
}

/* ------------------------------------------------------------------ */
/* oRPC helpers                                                        */
/* ------------------------------------------------------------------ */

type AnyORPCError = InstanceType<typeof ORPCError>;

function getBadRequestIssues(error: AnyORPCError): string[] | null {
	const data: unknown = error.data;
	if (typeof data === "object" && data !== null && "issues" in data && Array.isArray(data.issues)) {
		const messages = new Set<string>();
		for (const issue of data.issues) {
			if (typeof issue !== "object" || issue === null || typeof issue.message !== "string") continue;
			const message = issue.message.trim();
			if (message) messages.add(message);
			if (messages.size === 3) break;
		}
		if (messages.size > 0) return [...messages];
	}
	return null;
}

export function getReadableErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
		const issues = getBadRequestIssues(error);
		if (issues) return issues.join(" ");
	}

	if (typeof error === "string" && error) return error;
	if (error instanceof Error && error.message) return error.message;
	// Better Auth client errors are plain objects ({ code, message, status }), not Error instances.
	if (typeof error === "object" && error !== null && "message" in error) {
		const { message } = error as { message?: unknown };
		if (typeof message === "string" && message) return message;
	}
	return fallback;
}

type ErrorMessageByCode = Record<string, string>;

export function getOrpcErrorMessage(
	error: unknown,
	options: {
		fallback: string;
		byCode?: ErrorMessageByCode;
		allowServerMessage?: boolean;
	},
): string {
	if (!(error instanceof ORPCError)) return getReadableErrorMessage(error, options.fallback);

	const mappedMessage = options.byCode?.[error.code];
	if (mappedMessage) return mappedMessage;

	if (options.allowServerMessage && error.message) return error.message;
	return options.fallback;
}

/* ------------------------------------------------------------------ */
/* Localized errors                                                    */
/* ------------------------------------------------------------------ */

// Stable business codes thrown by the API. Server messages are log/debug detail only; the copy
// shown to users comes from this table through the active locale.
const businessErrorMessages: Record<string, MessageDescriptor> = {
	// resume
	RESUME_SLUG_ALREADY_EXISTS: msg`A resume with this slug already exists.`,
	RESUME_LOCKED: msg`This resume is locked. Unlock it first to make changes.`,
	RESUME_VERSION_CONFLICT: msg`The resume changed after this patch was generated.`,
	INVALID_PATCH_OPERATIONS: msg`The patch operations are invalid or produced an invalid resume.`,
	// cover letters
	COVER_LETTER_SAVE_CONFLICT: msg`This cover letter changed elsewhere. Reload it before saving again.`,
	COVER_LETTER_DELETE_CONFLICT: msg`This cover letter changed elsewhere. Reload it before deleting.`,
	// agent
	AGENT_ATTACHMENTS_INVALID: msg`The selected attachments are invalid. Please review your selection.`,
	AGENT_ATTACHMENTS_TOO_MANY: msg`Too many attachments for one message.`,
	AGENT_ATTACHMENTS_UNAVAILABLE: msg`One or more attachments are unavailable or already linked to a message.`,
	AGENT_ATTACHMENT_TOO_LARGE: msg`That file is too large. The limit is 25MB per attachment.`,
	AGENT_THREAD_STORAGE_FULL: msg`This conversation's attachment storage is full. Delete some attachments first.`,
	AGENT_ENVIRONMENT_UNAVAILABLE: msg`The AI agent workspace is unavailable because REDIS_URL or ENCRYPTION_SECRET is not configured.`,
	AGENT_QUESTION_NOT_FOUND: msg`The question to answer could not be found.`,
	AGENT_RESPONSE_ALREADY_HANDLED: msg`This response was already handled.`,
	AGENT_REVIEW_LOCKED: msg`Review settings cannot change while a task is active.`,
	AGENT_THREAD_ARCHIVED: msg`This conversation is archived.`,
	AGENT_THREAD_BUSY: msg`This conversation already has an active task.`,
	AGENT_THREAD_READ_ONLY: msg`This conversation is read-only.`,
	AGENT_ROLLBACK_UNSUPPORTED: msg`Only resume patch actions can be rolled back.`,
	AGENT_RESUME_GONE: msg`The edited resume no longer exists.`,
	AGENT_ROLLBACK_UNAVAILABLE: msg`This patch does not have a rollback snapshot.`,
	AGENT_ROLLBACK_CONFLICT: msg`A later edit changed the same field. Nothing was undone; review that field and try again.`,
	AGENT_PATCH_NOT_APPLIED: msg`This patch is no longer applied.`,
	// ai
	AI_PROVIDER_UNREACHABLE: msg`Could not reach the AI provider.`,
	AI_PROVIDER_INVALID: msg`Invalid AI provider configuration.`,
	AI_FREE_QUOTA_EXCEEDED: msg`Your free AI quota is used up for today. Try again tomorrow or connect your own API key in Settings.`,
	AI_PROVIDER_UNAVAILABLE: msg`No tested AI provider is available.`,
	AI_PROVIDER_NOT_CONFIGURED: msg`No AI provider is configured. Add one in Settings → Integrations to use AI features.`,
	AI_ENCRYPTION_UNAVAILABLE: msg`AI providers are unavailable because ENCRYPTION_SECRET is not configured.`,
	AI_REQUEST_INVALID: msg`Invalid resume data structure`,
	AI_RESPONSE_INVALID: msg`The AI response could not be parsed.`,
	// applications
	APPLICATION_DATE_INVALID: msg`Date must use YYYY-MM-DD format.`,
	APPLICATION_TIMELINE_INVALID: msg`Application timeline is missing its current stage entry.`,
	APPLICATION_STAGE_DATE_INVALID: msg`Current stage date cannot be older than another stage entry.`,
	APPLICATION_DOCUMENTS_INVALID: msg`Application documents must be PDF files.`,
	APPLICATION_TIMELINE_IMMUTABLE: msg`The stage timeline is derived and cannot be edited or deleted.`,
	APPLICATION_AI_NO_RESUME: msg`Link a resume to this application first.`,
	APPLICATION_AI_NO_JD: msg`Paste the job description into this application first.`,
};

// Server-side zod schemas carry custom English messages; exact-match the user-facing ones so they
// localize too. Unmatched issues are logged only — the UI shows a localized validation fallback.
const zodIssueMessages: Record<string, MessageDescriptor> = {
	"File size must be less than 10MB": msg`File size must be less than 10MB`,
};

const attachmentUnreadableFallback = msg`An attachment could not be read.`;
const validationFallback = msg`Some entries failed validation. Please review and try again.`;

/**
 * User-facing error copy that follows the interface language.
 *
 * Resolution order: call-site `byCode` overrides → API business code → known zod issue text →
 * Better Auth code → localized fallback. The raw error is always logged for troubleshooting; its
 * server message is never shown verbatim.
 */
export function getLocalizedErrorMessage(
	error: unknown,
	fallback: string | MessageDescriptor,
	byCode?: Record<string, string | MessageDescriptor>,
): string {
	if (error instanceof ORPCError) {
		const override = byCode?.[error.code];
		// t`…` values arrive as already-resolved strings (evaluated when the handler runs); msg`
		// …` descriptors resolve here against the active locale.
		if (override) return typeof override === "string" ? override : i18n._(override);

		const business = businessErrorMessages[error.code];
		if (business) return i18n._(business);

		if (error.code === "AGENT_ATTACHMENT_UNREADABLE") {
			const data = error.data as { filename?: unknown } | undefined;
			if (typeof data?.filename === "string" && data.filename) {
				return t`Attachment ${data.filename} could not be read.`;
			}
			return i18n._(attachmentUnreadableFallback);
		}

		if (error.code === "BAD_REQUEST") {
			const issues = getBadRequestIssues(error);
			if (issues) {
				// Matched issues render through the catalog; unmatched ones stay in the log only so
				// raw server-side English never reaches the UI.
				const unmatched = issues.filter((issue) => !zodIssueMessages[issue]);
				if (unmatched.length > 0) console.warn("Unlocalized validation issues:", unmatched);
				const matched = issues.filter((issue) => zodIssueMessages[issue]);
				if (matched.length > 0) return matched.map((issue) => i18n._(zodIssueMessages[issue])).join(" ");
				return i18n._(validationFallback);
			}
		}
	}

	const auth = resolveAuthErrorMessage(error);
	if (auth) return auth;

	console.error("Operation failed:", error);
	return typeof fallback === "string" ? fallback : i18n._(fallback);
}

// Descriptors resolve through i18n at call time, so mapped and fallback copy both follow the
// active locale.
const resumeFallbackMessage = msg`Something went wrong. Please try again.`;

export function getResumeErrorMessage(error: unknown): string {
	return getLocalizedErrorMessage(error, resumeFallbackMessage);
}
