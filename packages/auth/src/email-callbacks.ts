import type { SendEmailOptions, SendEmailResult } from "@reactive-resume/email/transport";
import { createElement } from "react";
import { createOtpEmail, VerifyEmailChange } from "@reactive-resume/email/templates/auth";
import { isSmtpResponseCode, sendEmail } from "@reactive-resume/email/transport";

type EmailSender = (options: SendEmailOptions) => Promise<SendEmailResult>;

type UserEmailInput = {
	user: { email: string };
	url: string;
};

async function deliverAuthEmail(options: SendEmailOptions, sender: EmailSender): Promise<void> {
	const purpose = options.purpose ?? "generic";
	try {
		const result = await sender(options);
		if (result.status === "accepted") return;

		const isOtp = purpose === "sign_in_otp" || purpose === "password_reset_otp";
		const details = {
			purpose,
			status: result.status,
			...("reason" in result ? { reason: result.reason } : {}),
			...(!isOtp && "errorCode" in result ? { errorCode: result.errorCode } : {}),
			...(result.status === "failed" && "responseCode" in result && (!isOtp || isSmtpResponseCode(result.responseCode))
				? { responseCode: result.responseCode }
				: {}),
		};
		if (result.status === "failed") console.error("[AuthEmail] delivery failed", details);
		else console.warn("[AuthEmail] delivery skipped", details);
	} catch {
		console.error("[AuthEmail] delivery failed", { purpose, status: "failed", reason: "transport_error" });
	}
}

export function createAuthEmailCallbacks(sender: EmailSender = sendEmail) {
	return {
		sendVerificationOTP: async ({ email, otp, type }: { email: string; otp: string; type: string }) => {
			if (type !== "sign-in" && type !== "forget-password") return;
			await deliverAuthEmail(
				{ to: email, ...createOtpEmail(type === "sign-in" ? "sign_in_otp" : "password_reset_otp", otp) },
				sender,
			);
		},
		sendResetPassword: async ({ user, url }: UserEmailInput) => {
			await deliverAuthEmail(
				{
					to: user.email,
					subject: "Weekly Resume password reset",
					text: `Open this link to reset your Weekly Resume password: ${url}`,
					purpose: "password_reset",
				},
				sender,
			);
		},
		sendVerificationEmail: async ({ user, url }: UserEmailInput) => {
			await deliverAuthEmail(
				{
					to: user.email,
					subject: "Weekly Resume email verification",
					text: `Open this link to verify your Weekly Resume email: ${url}`,
					purpose: "email_verification",
				},
				sender,
			);
		},
		sendChangeEmailConfirmation: async ({ user, newEmail, url }: UserEmailInput & { newEmail: string }) => {
			await deliverAuthEmail(
				{
					to: newEmail,
					subject: "Verify your new email",
					react: createElement(VerifyEmailChange, { url, previousEmail: user.email, newEmail }),
					purpose: "change_email",
				},
				sender,
			);
		},
	};
}
