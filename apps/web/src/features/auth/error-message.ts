// The Better Auth error table lives in libs/error-message.ts so every toast site (settings,
// dialogs, auth pages) shares one localized resolution chain. Re-exported here to keep the
// relative imports of the auth pages stable.
export {
	formatRetryAfterDuration,
	getAuthErrorMessage,
	isAuthRateLimitError,
	isInvalidResetTokenError,
	parseRetryAfter,
	resolveAuthErrorMessage,
} from "@/libs/error-message";
