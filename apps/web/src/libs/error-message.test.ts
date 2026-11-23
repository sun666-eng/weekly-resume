import { describe, expect, it, vi } from "vitest";
import { msg } from "@lingui/core/macro";
import { ORPCError } from "@orpc/client";
import {
	getAuthErrorMessage,
	getLocalizedErrorMessage,
	getOrpcErrorMessage,
	getReadableErrorMessage,
	getResumeErrorMessage,
	getRetryAfterSeconds,
	isInvalidResetTokenError,
	parseRetryAfter,
	resolveAuthErrorMessage,
} from "./error-message";

describe("Retry-After parsing", () => {
	it.each([
		["12", 12],
		[" 120 ", 120],
		["0", undefined],
		["-1", undefined],
		["invalid", undefined],
		["9007199254740992", undefined],
	])("parses %s as %s", (value, expected) => {
		expect(parseRetryAfter(value)).toBe(expected);
	});

	it("parses HTTP dates and prefers X-Retry-After", () => {
		const now = Date.UTC(2026, 10, 20, 12, 0, 0);
		expect(parseRetryAfter(new Date(now + 61_000).toUTCString(), now)).toBe(61);
		expect(
			getRetryAfterSeconds(
				new Headers({
					"X-Retry-After": "15",
					"Retry-After": "120",
				}),
			),
		).toBe(15);
	});

	it("falls back to Retry-After when X-Retry-After is invalid", () => {
		expect(getRetryAfterSeconds(new Headers({ "X-Retry-After": "invalid", "Retry-After": "20" }))).toBe(20);
	});
});

describe("Better Auth error messages", () => {
	it.each([
		["INVALID_OTP", "Invalid OTP", "Incorrect verification code. Please try again."],
		["OTP_EXPIRED", "OTP expired", "This verification code has expired. Please request a new one."],
		["TOO_MANY_ATTEMPTS", "Too many attempts", "Too many attempts. Please request a new code."],
		[
			"TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP",
			"Two-factor authentication is enabled on this account. Please sign in with your password.",
			"This account uses two-factor authentication. Sign in with your password and complete two-factor verification.",
		],
	])("maps %s by code and by upstream message", (code, message, expected) => {
		expect(resolveAuthErrorMessage({ code })).toBe(expected);
		expect(resolveAuthErrorMessage({ message })).toBe(expected);
	});
	it.each([
		[1, "Too many requests. Please try again in 1 second."],
		[45, "Too many requests. Please try again in 45 seconds."],
		[60, "Too many requests. Please try again in 1 minute."],
		[125, "Too many requests. Please try again in 2 minutes 5 seconds."],
	])("formats a %i second rate limit", (retryAfterSeconds, expected) => {
		expect(getAuthErrorMessage({ status: 429 }, "fallback", retryAfterSeconds)).toBe(expected);
	});

	it("uses the localized generic message when no retry duration is available", () => {
		expect(resolveAuthErrorMessage({ message: "Too many requests. Please try again later." })).toBe(
			"Too many requests. Please try again later.",
		);
	});

	it.each([
		[{ code: "INVALID_TOKEN" }],
		[{ code: "TOKEN_EXPIRED" }],
		[{ message: "Invalid token" }],
		[{ message: "Token expired" }],
	])("recognizes an invalid or expired reset credential", (error) => {
		expect(isInvalidResetTokenError(error)).toBe(true);
	});

	it.each([
		[{ code: "INVALID_TOKEN" }, "This link is invalid. Please request a new one."],
		[{ code: "TOKEN_EXPIRED" }, "This link has expired. Please request a new one."],
	])("maps reset token error %j", (error, expected) => {
		expect(resolveAuthErrorMessage(error)).toBe(expected);
	});
});

describe("getReadableErrorMessage", () => {
	it("shows the upload size validation message instead of the generic oRPC error", () => {
		const error = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
			data: { issues: [{ message: "File size must be less than 10MB", path: [] }] },
		});
		expect(getReadableErrorMessage(error, "Failed to upload picture.")).toBe("File size must be less than 10MB");
	});

	it("limits validation messages, removes duplicates, and ignores malformed issues", () => {
		const error = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
			data: {
				issues: [
					null,
					{},
					{ message: 42 },
					{ message: " " },
					...["First", "First", "Second", "Third", "Fourth"].map((message) => ({ message })),
				],
			},
		});
		expect(getReadableErrorMessage(error, "fallback")).toBe("First Second Third");
	});

	it.each([null, {}, { issues: null }, { issues: "invalid" }, { issues: [{ message: "" }] }])(
		"retains the error message for malformed validation data %j",
		(data) => {
			const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed", data });
			expect(getReadableErrorMessage(error, "fallback")).toBe("Input validation failed");
		},
	);

	it("does not interpret unrelated server errors as input validation", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Unexpected failure",
			data: { issues: [{ message: "Internal detail" }] },
		});
		expect(getReadableErrorMessage(error, "fallback")).toBe("Unexpected failure");
	});

	it("returns the string error directly", () => {
		expect(getReadableErrorMessage("explicit error", "fallback")).toBe("explicit error");
	});

	it("returns Error.message", () => {
		expect(getReadableErrorMessage(new Error("boom"), "fallback")).toBe("boom");
	});

	it("returns the message of a plain error object (Better Auth client errors)", () => {
		expect(getReadableErrorMessage({ code: "SESSION_NOT_FRESH", message: "Session is not fresh" }, "fallback")).toBe(
			"Session is not fresh",
		);
	});

	it("returns fallback for unknown shapes", () => {
		expect(getReadableErrorMessage({ random: "object" }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage({ message: "" }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage({ message: 42 }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(null, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(undefined, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(42, "fallback")).toBe("fallback");
	});

	it("returns fallback for empty string error (falsy)", () => {
		expect(getReadableErrorMessage("", "fallback")).toBe("fallback");
	});

	it("returns fallback for Error with empty message", () => {
		expect(getReadableErrorMessage(new Error(""), "fallback")).toBe("fallback");
	});
});

describe("getOrpcErrorMessage", () => {
	it("delegates to getReadableErrorMessage for non-ORPCErrors", () => {
		expect(getOrpcErrorMessage(new Error("boom"), { fallback: "fallback" })).toBe("boom");
		expect(getOrpcErrorMessage("string error", { fallback: "fallback" })).toBe("string error");
	});

	it("uses byCode mapping when present", () => {
		const error = new ORPCError("RESUME_LOCKED");
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				byCode: { RESUME_LOCKED: "It is locked." },
			}),
		).toBe("It is locked.");
	});

	it("returns server message when allowServerMessage and message is set", () => {
		const error = new ORPCError("OTHER", { message: "Server-provided message" });
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				allowServerMessage: true,
			}),
		).toBe("Server-provided message");
	});

	it("falls back when allowServerMessage is false even if message set", () => {
		const error = new ORPCError("OTHER", { message: "Server-provided message" });
		expect(getOrpcErrorMessage(error, { fallback: "fallback" })).toBe("fallback");
	});

	it("byCode takes precedence over allowServerMessage", () => {
		const error = new ORPCError("RESUME_LOCKED", { message: "Server msg" });
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				byCode: { RESUME_LOCKED: "It is locked." },
				allowServerMessage: true,
			}),
		).toBe("It is locked.");
	});

	it("returns fallback when no mapping or server message", () => {
		const error = new ORPCError("UNKNOWN_CODE");
		expect(getOrpcErrorMessage(error, { fallback: "fallback" })).toBe("fallback");
	});
});

describe("getResumeErrorMessage", () => {
	it("returns mapped message for RESUME_SLUG_ALREADY_EXISTS", () => {
		const error = new ORPCError("RESUME_SLUG_ALREADY_EXISTS");
		expect(getResumeErrorMessage(error)).toBe("A resume with this slug already exists.");
	});

	it("returns mapped message for RESUME_LOCKED", () => {
		const error = new ORPCError("RESUME_LOCKED");
		expect(getResumeErrorMessage(error)).toBe("This resume is locked. Unlock it first to make changes.");
	});

	it("returns generic fallback for unknown codes", () => {
		const error = new ORPCError("UNKNOWN");
		expect(getResumeErrorMessage(error)).toBe("Something went wrong. Please try again.");
	});

	it("returns the localized fallback for a plain Error, keeping the raw error in the console", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(getResumeErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			consoleError.mockRestore();
		}
	});

	it("returns the localized fallback for unknown shape, keeping the raw error in the console", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(getResumeErrorMessage(null)).toBe("Something went wrong. Please try again.");
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			consoleError.mockRestore();
		}
	});
});

describe("getLocalizedErrorMessage", () => {
	it("maps API business codes to localized copy", () => {
		expect(getLocalizedErrorMessage(new ORPCError("COVER_LETTER_SAVE_CONFLICT"), "fallback")).toBe(
			"This cover letter changed elsewhere. Reload it before saving again.",
		);
	});

	it("interpolates attachment filenames from error data", () => {
		const error = new ORPCError("AGENT_ATTACHMENT_UNREADABLE", { data: { filename: "a.pdf" } });
		expect(getLocalizedErrorMessage(error, "fallback")).toBe("Attachment a.pdf could not be read.");
	});

	it("falls back when the unreadable attachment carries no filename", () => {
		expect(getLocalizedErrorMessage(new ORPCError("AGENT_ATTACHMENT_UNREADABLE"), "fallback")).toBe(
			"An attachment could not be read.",
		);
	});

	it("localizes known zod issue messages and logs unmatched ones", () => {
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const error = new ORPCError("BAD_REQUEST", {
				message: "Input validation failed",
				data: { issues: [{ message: "File size must be less than 10MB" }, { message: "Too small: expected string" }] },
			});
			expect(getLocalizedErrorMessage(error, "fallback")).toBe("File size must be less than 10MB");
			expect(consoleWarn).toHaveBeenCalledOnce();
		} finally {
			consoleWarn.mockRestore();
		}
	});

	it("shows a localized validation fallback when no zod issue matches", () => {
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const error = new ORPCError("BAD_REQUEST", {
				message: "Input validation failed",
				data: { issues: [{ message: "Invalid input: expected string, received number" }] },
			});
			expect(getLocalizedErrorMessage(error, "fallback")).toBe(
				"Some entries failed validation. Please review and try again.",
			);
			expect(consoleWarn).toHaveBeenCalledOnce();
		} finally {
			consoleWarn.mockRestore();
		}
	});

	it("lets call sites override business-code copy through byCode", () => {
		const error = new ORPCError("AI_PROVIDER_UNREACHABLE");
		expect(
			getLocalizedErrorMessage(error, "fallback", {
				AI_PROVIDER_UNREACHABLE: msg`Your AI provider could not be reached. Check its settings and try again.`,
			}),
		).toBe("Your AI provider could not be reached. Check its settings and try again.");
		// Without an override the shared business table applies.
		expect(getLocalizedErrorMessage(error, "fallback")).toBe("Could not reach the AI provider.");
	});

	it("maps Better Auth codes through the shared auth table", () => {
		const error = { code: "USERNAME_IS_ALREADY_TAKEN", message: "Username is already taken" };
		expect(getLocalizedErrorMessage(error, "fallback")).toBe("This username is already taken.");
	});

	it("returns the localized fallback and logs raw errors", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(getLocalizedErrorMessage(new Error("boom"), "Something went wrong.")).toBe("Something went wrong.");
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			consoleError.mockRestore();
		}
	});
});
