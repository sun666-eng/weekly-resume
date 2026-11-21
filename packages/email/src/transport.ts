import type { SendMailOptions, Transporter } from "nodemailer";
import type { ReactElement } from "react";
import nodemailer from "nodemailer";
import { render } from "react-email";
import { env } from "@reactive-resume/env/server";

export type EmailPurpose = "password_reset" | "email_verification" | "change_email" | "generic";

export type SendEmailResult =
	| {
			status: "accepted";
			purpose: EmailPurpose;
			messageId?: string;
			accepted: string[];
			rejected: string[];
			response?: string;
			latencyMs: number;
	  }
	| {
			status: "skipped";
			purpose: EmailPurpose;
			reason: "not_configured" | "empty_content";
			missingKeys?: string[];
	  }
	| {
			status: "failed";
			purpose: EmailPurpose;
			reason: "rejected" | "transport_error";
			message: string;
			errorCode?: string;
			responseCode?: number;
			command?: string;
			rejected?: string[];
			latencyMs: number;
	  };

export type SendEmailOptions = {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	react?: ReactElement;
	from?: string;
	purpose?: EmailPurpose;
};

type SmtpConfig = {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
};

let cachedTransport: Transporter | undefined;
let cachedTransportSignature: string | undefined;

const smtpKeys = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

export const isSmtpEnabled = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);

const getMissingSmtpKeys = () => smtpKeys.filter((key) => !env[key]);

const getSmtpConfig = (): SmtpConfig | undefined => {
	if (!isSmtpEnabled()) return;
	return {
		host: env.SMTP_HOST as string,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE,
		user: env.SMTP_USER as string,
		pass: env.SMTP_PASS as string,
		from: env.SMTP_FROM as string,
	};
};

const getTransport = (config: SmtpConfig) => {
	const signature = [config.host, config.port, config.secure, config.user, config.pass, config.from].join("\u0000");
	if (cachedTransport && cachedTransportSignature === signature) return cachedTransport;

	cachedTransport = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: { user: config.user, pass: config.pass },
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 15_000,
	});
	cachedTransportSignature = signature;
	return cachedTransport;
};

export function resetTransportCacheForTests() {
	cachedTransport = undefined;
	cachedTransportSignature = undefined;
}

function redactEmail(value: string): string {
	const [localPart, domain] = value.split("@", 2);
	if (!domain || !localPart) return "[redacted]";
	return `${localPart.slice(0, 1)}***@${domain}`;
}

function recipientList(value: string | string[]): string[] {
	return (Array.isArray(value) ? value : [value]).map(redactEmail);
}

function safeLogSubject(value: string): string {
	return value
		.replace(/\p{Cc}/gu, " ")
		.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
		.replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, "[url redacted]")
		.replace(/\b[\w.-]+\.[a-z]{2,}\/[^\s<>"']*/gi, "[url redacted]")
		.replace(/\b(?:password|pass|token|secret|auth)\s*[=:]\s*[^\s,;]+/gi, "[redacted]")
		.replace(/\b[\w-]*token[\w-]*\b/gi, "[token redacted]")
		.replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
		.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token redacted]")
		.slice(0, 160);
}

function safeErrorMessage(_error: unknown): string {
	// SMTP libraries may include message bodies, links, recipients, or credentials in raw errors.
	return "SMTP transport failed";
}

function safeErrorCode(value: unknown): string | undefined {
	return typeof value === "string" && /^[A-Z][A-Z0-9_-]{0,39}$/i.test(value) ? value : undefined;
}

function safeSmtpCommand(value: unknown): string | undefined {
	return typeof value === "string" && /^[A-Z][A-Z0-9_-]*(?: [A-Z][A-Z0-9_-]*)?$/i.test(value) ? value : undefined;
}

function safeLogMessageId(value: string | undefined): string | undefined {
	if (!value) return;
	return /^<[\w.+-]{1,100}@[a-z\d.-]{1,120}>$/i.test(value) ? value : "[redacted]";
}

function logBaseFields(options: SendEmailOptions, purpose: EmailPurpose) {
	return {
		purpose,
		to: recipientList(options.to),
		recipientCount: Array.isArray(options.to) ? options.to.length : 1,
		subject: safeLogSubject(options.subject),
		acceptedCount: 0,
		rejectedCount: 0,
	};
}

function logEmail(level: "info" | "warn" | "error", data: Record<string, unknown>) {
	if (level === "info") console.info("[Email]", data);
	if (level === "warn") console.warn("[Email]", data);
	if (level === "error") console.error("[Email]", data);
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
	const purpose = options.purpose ?? "generic";
	const logFields = logBaseFields(options, purpose);
	const config = getSmtpConfig();
	const from = options.from ?? config?.from ?? "Weekly Resume <noreply@localhost>";
	const payload: SendMailOptions = {
		to: options.to,
		from,
		subject: options.subject,
		...(options.text === undefined ? {} : { text: options.text }),
		...(options.html === undefined ? {} : { html: options.html }),
	};

	if (options.react) {
		const startedAt = performance.now();
		try {
			payload.html = await render(options.react);
			payload.text = options.text ?? (await render(options.react, { plainText: true }));
		} catch {
			const result: SendEmailResult = {
				status: "failed",
				purpose,
				reason: "transport_error",
				message: "Email template render failed",
				latencyMs: Math.round(performance.now() - startedAt),
			};
			logEmail("error", { ...logFields, ...result });
			return result;
		}
	}

	if (!payload.text && !payload.html) {
		const result: SendEmailResult = { status: "skipped", purpose, reason: "empty_content" };
		logEmail("warn", {
			...logFields,
			status: result.status,
			reason: result.reason,
		});
		return result;
	}

	if (!config) {
		const result: SendEmailResult = {
			status: "skipped",
			purpose,
			reason: "not_configured",
			missingKeys: getMissingSmtpKeys(),
		};
		logEmail("warn", {
			...logFields,
			status: result.status,
			reason: result.reason,
			missingKeys: result.missingKeys,
		});
		return result;
	}

	const startedAt = performance.now();
	try {
		const transport = getTransport(config);
		const info = await transport.sendMail(payload);
		const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
		const rejected = Array.isArray(info.rejected) ? info.rejected.map(String) : [];
		const latencyMs = Math.round(performance.now() - startedAt);
		const base = {
			...logFields,
			...(typeof info.messageId === "string" ? { messageId: safeLogMessageId(info.messageId) } : {}),
			acceptedCount: accepted.length,
			rejectedCount: rejected.length,
			...(typeof info.responseCode === "number" ? { responseCode: info.responseCode } : {}),
			latencyMs,
		};

		if (rejected.length > 0 || accepted.length === 0) {
			const result: SendEmailResult = {
				status: "failed",
				purpose,
				reason: "rejected",
				message: "SMTP rejected the message",
				...(typeof info.responseCode === "number" ? { responseCode: info.responseCode } : {}),
				rejected,
				latencyMs,
			};
			logEmail("error", { ...base, status: result.status, reason: result.reason });
			return result;
		}

		const result: SendEmailResult = {
			status: "accepted",
			purpose,
			...(typeof info.messageId === "string" ? { messageId: info.messageId } : {}),
			accepted,
			rejected,
			...(typeof info.response === "string" ? { response: info.response } : {}),
			latencyMs,
		};
		logEmail("info", { ...base, status: result.status });
		return result;
	} catch (error) {
		const candidate =
			typeof error === "object" && error !== null
				? (error as { code?: unknown; responseCode?: unknown; command?: unknown })
				: {};
		const errorCode = safeErrorCode(candidate.code);
		const command = safeSmtpCommand(candidate.command);
		const latencyMs = Math.round(performance.now() - startedAt);
		const result: SendEmailResult = {
			status: "failed",
			purpose,
			reason: "transport_error",
			message: safeErrorMessage(error),
			...(errorCode ? { errorCode } : {}),
			...(typeof candidate.responseCode === "number" ? { responseCode: candidate.responseCode } : {}),
			...(command ? { command } : {}),
			latencyMs,
		};
		logEmail("error", {
			...logFields,
			status: result.status,
			reason: result.reason,
			message: result.message,
			...(result.errorCode ? { errorCode: result.errorCode } : {}),
			...(result.responseCode ? { responseCode: result.responseCode } : {}),
			...(result.command ? { command: result.command } : {}),
			latencyMs,
		});
		return result;
	}
}

export async function verifySmtpConnection(): Promise<
	| { status: "ok" }
	| { status: "not_configured"; missingKeys: string[] }
	| { status: "failed"; message: string; errorCode?: string; responseCode?: number; command?: string }
> {
	const config = getSmtpConfig();
	if (!config) return { status: "not_configured", missingKeys: getMissingSmtpKeys() };

	try {
		await getTransport(config).verify();
		return { status: "ok" };
	} catch (error) {
		const candidate =
			typeof error === "object" && error !== null
				? (error as { code?: unknown; responseCode?: unknown; command?: unknown })
				: {};
		const errorCode = safeErrorCode(candidate.code);
		const command = safeSmtpCommand(candidate.command);
		return {
			status: "failed",
			message: safeErrorMessage(error),
			...(errorCode ? { errorCode } : {}),
			...(typeof candidate.responseCode === "number" ? { responseCode: candidate.responseCode } : {}),
			...(command ? { command } : {}),
		};
	}
}
