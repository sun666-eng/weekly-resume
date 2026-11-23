import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";

const envMock = vi.hoisted(() => ({
	APP_URL: "http://localhost",
	SMTP_HOST: undefined as string | undefined,
	SMTP_PORT: 587,
	SMTP_USER: undefined as string | undefined,
	SMTP_PASS: undefined as string | undefined,
	SMTP_FROM: undefined as string | undefined,
	SMTP_SECURE: false,
}));

const sendMail = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail, verify })));
const render = vi.hoisted(() => vi.fn());

vi.mock("@reactive-resume/env/server", () => ({ env: envMock }));
vi.mock("nodemailer", () => ({
	default: { createTransport },
	createTransport,
}));
vi.mock("react-email", () => ({ render }));

const { isSmtpEnabled, resetTransportCacheForTests, sendEmail, verifySmtpConnection } = await import("./transport");

const { createOtpEmail } = await import("./templates/auth");

it.each(["sign_in_otp", "password_reset_otp"] as const)(
	"keeps %s codes in the message body only in every delivery outcome",
	async (purpose) => {
		resetEnv();
		const otp = "041628";
		const to = "recipient@example.test";
		const options = { to, ...createOtpEmail(purpose, otp) };
		expect(options.subject).not.toMatch(/\d{6}/);
		expect(options.text).toContain(`\n\n${otp}\n\n`);
		expect(options.text).toMatch(/10 minutes.*ignore this email/);
		const logs = (["info", "warn", "error"] as const).map((level) =>
			vi.spyOn(console, level).mockImplementation(() => {}),
		);
		try {
			expect((await sendEmail(options)).status).toBe("skipped");
			configureSmtp();
			sendMail.mockResolvedValueOnce({ accepted: [to], responseCode: 250, messageId: `<${otp}@example.test>` });
			expect((await sendEmail(options)).status).toBe("accepted");
			expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: options.text, subject: options.subject }));
			sendMail.mockRejectedValueOnce(
				Object.assign(new Error(options.text), { code: `E${otp}`, responseCode: 535, command: "AUTH LOGIN" }),
			);
			expect((await sendEmail(options)).status).toBe("failed");
			expect(logs[0]?.mock.calls[0]?.[1]).not.toHaveProperty("responseCode");
			expect(logs[2]).toHaveBeenCalledWith("[Email]", expect.objectContaining({ responseCode: 535 }));
			for (const log of logs) {
				expect(log).toHaveBeenCalledTimes(1);
				const output = JSON.stringify(log.mock.calls);
				for (const value of [
					otp,
					to,
					options.text,
					options.subject,
					"messageId",
					"subject",
					"errorCode",
					"command",
					"AUTH LOGIN",
				])
					expect(output).not.toContain(value);
			}
		} finally {
			for (const log of logs) log.mockRestore();
		}
	},
);

it.each([
	[100, true],
	[550, true],
	[599, true],
	[99, false],
	[600, false],
	[535.5, false],
	[123456, false],
	["535", false],
] as const)("filters the SMTP reply code %s for rejected OTP deliveries", async (responseCode, shouldLog) => {
	resetEnv();
	configureSmtp();
	const otp = "123456";
	const to = "member@example.test";
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		sendMail.mockResolvedValueOnce({ rejected: [to], responseCode, messageId: `<${otp}@example.test>` });
		expect((await sendEmail({ to, ...createOtpEmail("password_reset_otp", otp) })).status).toBe("failed");
		const details = log.mock.calls[0]?.[1];
		if (shouldLog) expect(details).toHaveProperty("responseCode", responseCode);
		else expect(details).not.toHaveProperty("responseCode");
		expect(JSON.stringify(log.mock.calls)).not.toContain(otp);
		expect(JSON.stringify(log.mock.calls)).not.toContain(to);
	} finally {
		log.mockRestore();
	}
});

function resetEnv() {
	envMock.SMTP_HOST = undefined;
	envMock.SMTP_USER = undefined;
	envMock.SMTP_PASS = undefined;
	envMock.SMTP_FROM = undefined;
	resetTransportCacheForTests();
	createTransport.mockClear();
	sendMail.mockReset();
	verify.mockReset();
	render.mockReset();
	render.mockImplementation(async (_node: unknown, opts?: { plainText?: boolean }) =>
		opts?.plainText ? "plain text body" : "<p>html body</p>",
	);
	sendMail.mockResolvedValue({
		messageId: "<id@example.com>",
		accepted: ["a@b.com"],
		rejected: [],
		response: "250 OK",
	});
	verify.mockResolvedValue(true);
}

function configureSmtp() {
	envMock.SMTP_HOST = "smtp.example.com";
	envMock.SMTP_USER = "smtp-user";
	envMock.SMTP_PASS = "smtp-password";
	envMock.SMTP_FROM = "noreply@example.com";
}

describe("sendEmail", () => {
	it("returns skipped for empty content without contacting SMTP", async () => {
		resetEnv();
		const result = await sendEmail({ to: "a@b.com", subject: "hi", purpose: "password_reset" });

		expect(result).toEqual({ status: "skipped", purpose: "password_reset", reason: "empty_content" });
		expect(sendMail).not.toHaveBeenCalled();
	});

	it("returns skipped with missing keys and never logs message content", async () => {
		resetEnv();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const body = "reset-token https://example.com/reset?token=secret";

		const result = await sendEmail({
			to: "alice.smith@gmail.com",
			subject:
				"Reset reset-token https://example.com/reset?token=subject-secret www.example.test/reset?token=web-secret example.net/reset?token=host-secret alice.smith@gmail.com",
			text: body,
			html: `<a href="https://example.com/reset?token=private-html-secret">reset</a>`,
			purpose: "password_reset",
		});

		expect(result).toMatchObject({ status: "skipped", purpose: "password_reset", reason: "not_configured" });
		expect(result).toHaveProperty("missingKeys", ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]);
		expect(JSON.stringify(warn.mock.calls)).not.toContain(body);
		expect(JSON.stringify(warn.mock.calls)).not.toContain("reset-token");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("subject-secret");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("www.example.test");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("web-secret");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("host-secret");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("private-html-secret");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("https://");
		expect(JSON.stringify(warn.mock.calls)).toContain("[email redacted]");
		expect(warn).toHaveBeenCalledWith(
			"[Email]",
			expect.objectContaining({
				purpose: "password_reset",
				status: "skipped",
				reason: "not_configured",
				to: ["a***@gmail.com"],
				recipientCount: 1,
				acceptedCount: 0,
				rejectedCount: 0,
				subject: "Reset [token redacted] [url redacted] [url redacted] [url redacted] [email redacted]",
			}),
		);
		warn.mockRestore();
	});

	it.each(["html", "plainText"])("returns a sanitized failure when %s template rendering throws", async (format) => {
		resetEnv();
		configureSmtp();
		const privateContent = "password=smtp-password https://example.com/reset?token=private-reset-token";
		if (format === "plainText") render.mockResolvedValueOnce("<p>html body</p>");
		render.mockRejectedValueOnce(new Error(privateContent));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const result = await sendEmail({
				to: "alice.smith@gmail.com",
				subject: "Reset request",
				react: createElement("p", null, privateContent),
				purpose: "password_reset",
			});

			expect(result).toEqual({
				status: "failed",
				purpose: "password_reset",
				reason: "transport_error",
				message: "Email template render failed",
				latencyMs: expect.any(Number),
			});
			expect(createTransport).not.toHaveBeenCalled();
			expect(sendMail).not.toHaveBeenCalled();
			expect(error).toHaveBeenCalledWith("[Email]", expect.objectContaining({ ...result, to: ["a***@gmail.com"] }));
			const logged = JSON.stringify(error.mock.calls);
			expect(logged).not.toContain("smtp-password");
			expect(logged).not.toContain("private-reset-token");
			expect(logged).not.toContain("https://");
			expect(logged).not.toContain("alice.smith@gmail.com");
		} finally {
			error.mockRestore();
		}
	});

	it("reports SMTP acceptance and configures explicit timeouts", async () => {
		resetEnv();
		configureSmtp();
		const result = await sendEmail({ to: "a@b.com", subject: "hi", text: "body", purpose: "email_verification" });

		expect(isSmtpEnabled()).toBe(true);
		expect(result).toMatchObject({
			status: "accepted",
			purpose: "email_verification",
			messageId: "<id@example.com>",
			accepted: ["a@b.com"],
			rejected: [],
			response: "250 OK",
			latencyMs: expect.any(Number),
		});
		expect(createTransport).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionTimeout: 10_000,
				greetingTimeout: 10_000,
				socketTimeout: 15_000,
				auth: { user: "smtp-user", pass: "smtp-password" },
			}),
		);
	});

	it.each([
		{ accepted: ["a@b.com"], rejected: ["bad@b.com"] },
		{ accepted: [], rejected: [] },
	])("returns failed when SMTP does not accept every recipient", async (info) => {
		resetEnv();
		configureSmtp();
		sendMail.mockResolvedValueOnce({ ...info, responseCode: 550 });

		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await sendEmail({ to: ["a@b.com", "bad@b.com"], subject: "hi", text: "body" });

		expect(result).toMatchObject({
			status: "failed",
			reason: "rejected",
			responseCode: 550,
			latencyMs: expect.any(Number),
		});
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("returns transport metadata without throwing and does not log body or password", async () => {
		resetEnv();
		configureSmtp();
		sendMail.mockRejectedValueOnce(
			Object.assign(new Error("auth password=smtp-password token=reset-token"), {
				code: "EAUTH",
				responseCode: 535,
				command: "AUTH LOGIN",
			}),
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await sendEmail({
			to: "a@b.com",
			subject: "hi",
			text: "reset-token https://example.com/reset?token=secret",
			html: `<a href="https://example.com/reset?token=private-html-secret">reset</a>`,
			purpose: "password_reset",
		});

		expect(result).toMatchObject({
			status: "failed",
			reason: "transport_error",
			errorCode: "EAUTH",
			responseCode: 535,
			command: "AUTH LOGIN",
			latencyMs: expect.any(Number),
		});
		expect(JSON.stringify(error.mock.calls)).not.toContain("smtp-password");
		expect(JSON.stringify(error.mock.calls)).not.toContain("reset-token");
		expect(JSON.stringify(error.mock.calls)).not.toContain("private-html-secret");
		expect(JSON.stringify(error.mock.calls)).not.toContain("https://example.com");
		error.mockRestore();
	});

	it("omits untrusted SMTP metadata from logs", async () => {
		resetEnv();
		configureSmtp();
		sendMail.mockRejectedValueOnce(
			Object.assign(new Error("token=private-reset-token"), {
				code: "EAUTH private-reset-token",
				responseCode: 535,
				command: "AUTH LOGIN private-reset-token",
			}),
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await sendEmail({
			to: "alice.smith@gmail.com",
			subject: "Reset request",
			text: "Password reset https://example.com/reset?token=private-reset-token",
			purpose: "password_reset",
		});

		expect(result).toMatchObject({ status: "failed", reason: "transport_error", responseCode: 535 });
		expect(result).not.toHaveProperty("errorCode");
		expect(result).not.toHaveProperty("command");
		expect(JSON.stringify(error.mock.calls)).not.toContain("private-reset-token");
		expect(JSON.stringify(error.mock.calls)).not.toContain("https://example.com");
		expect(JSON.stringify(error.mock.calls)).not.toContain("alice.smith@gmail.com");
		error.mockRestore();
	});

	it("refreshes the cached transport when SMTP configuration changes", async () => {
		resetEnv();
		configureSmtp();
		await sendEmail({ to: "a@b.com", subject: "hi", text: "body" });
		envMock.SMTP_HOST = "smtp.other.example";
		await sendEmail({ to: "a@b.com", subject: "hi", text: "body" });
		expect(createTransport).toHaveBeenCalledTimes(2);
	});
});

describe("verifySmtpConnection", () => {
	it("reports unconfigured SMTP without contacting a transport", async () => {
		resetEnv();
		expect(await verifySmtpConnection()).toEqual({
			status: "not_configured",
			missingKeys: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
		});
	});

	it("reports a failed verification with safe metadata", async () => {
		resetEnv();
		configureSmtp();
		verify.mockRejectedValueOnce(Object.assign(new Error("secret"), { code: "ECONNREFUSED", responseCode: 554 }));
		expect(await verifySmtpConnection()).toEqual({
			status: "failed",
			message: "SMTP transport failed",
			errorCode: "ECONNREFUSED",
			responseCode: 554,
			command: undefined,
		});
	});
});
