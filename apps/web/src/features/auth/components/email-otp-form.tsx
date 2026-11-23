import type { AuthFetchErrorContext } from "@/libs/auth/client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { OTPField } from "@reactive-resume/ui/components/otp-field";
import { toast } from "@reactive-resume/ui/components/toast";
import { authClient, getRetryAfterSecondsFromAuthContext } from "@/libs/auth/client";
import { formatRetryAfterDuration, getAuthErrorMessage, isAuthRateLimitError } from "../error-message";
import { getOAuthSignInOptions } from "../redirect";

type Props =
	| {
			mode: "sign-in";
			disableSignups: boolean;
			callbackURL?: string | undefined;
			onPassword: (email: string) => void;
			onSuccess: (data: unknown) => Promise<void>;
	  }
	| { mode: "reset"; onSuccess: () => void };

export function EmailOtpForm(props: Props) {
	const [address, setAddress] = useState("");
	const email = address.trim().toLowerCase();
	const [submitted, setSubmitted] = useState(false);
	const [otp, setOtp] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState("");
	const [errorCode, setErrorCode] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
	const [sendGlobalCooldown, setSendGlobalCooldown] = useState(0);
	const [verifyGlobalCooldown, setVerifyGlobalCooldown] = useState(0);
	const sendCooldown = Math.max(sendGlobalCooldown, cooldowns[email] ?? 0);
	const ticking = sendGlobalCooldown > 0 || verifyGlobalCooldown > 0 || Object.keys(cooldowns).length > 0;
	useEffect(() => {
		if (!ticking) return;
		const timer = window.setInterval(() => {
			setSendGlobalCooldown((seconds) => Math.max(0, seconds - 1));
			setVerifyGlobalCooldown((seconds) => Math.max(0, seconds - 1));
			setCooldowns((current) =>
				Object.fromEntries(
					Object.entries(current)
						.filter(([, seconds]) => seconds > 1)
						.map(([key, seconds]) => [key, seconds - 1]),
				),
			);
		}, 1000);
		return () => window.clearInterval(timer);
	}, [ticking]);

	const isReset = props.mode === "reset";
	function clearError() {
		setError("");
		setErrorCode("");
	}

	async function submit(action: "send" | "verify") {
		const sending = action === "send";
		if (pending.current || (sending ? sendCooldown : verifyGlobalCooldown) > 0) return;
		clearError();
		if (!z.email().safeParse(email).success) return setError(t`Enter a valid email address.`);
		if (!sending) {
			if (!/^\d{6}$/.test(otp)) return setError(t`Enter the 6-digit code from your email.`);
			if (isReset && password.length < 8) return setError(t`Password must be at least 8 characters.`);
			if (isReset && password.length > 64) return setError(t`Password must be at most 64 characters.`);
		}
		pending.current = true;
		setBusy(true);
		let retryAfter: number | undefined;
		const fetchOptions = {
			onError: (ctx: AuthFetchErrorContext) => {
				retryAfter = getRetryAfterSecondsFromAuthContext(ctx);
			},
		};
		const toastId = toast.add({
			type: "loading",
			description: sending
				? isReset
					? t`Submitting password reset request...`
					: t`Requesting your code...`
				: isReset
					? t`Updating your password...`
					: t`Signing in...`,
		});
		const fallback = t`The request could not be completed. Please try again.`;
		try {
			const result = sending
				? isReset
					? await authClient.emailOtp.requestPasswordReset({ email }, fetchOptions)
					: await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }, fetchOptions)
				: isReset
					? await authClient.emailOtp.resetPassword({ email, otp, password }, fetchOptions)
					: await authClient.signIn.emailOtp({ email, otp, ...getOAuthSignInOptions(props.callbackURL) }, fetchOptions);
			if (result.error) {
				if (isAuthRateLimitError(result.error)) {
					if (sending) setSendGlobalCooldown(retryAfter ?? 60);
					else setVerifyGlobalCooldown(retryAfter ?? 60);
				}
				const description = getAuthErrorMessage(result.error, fallback, retryAfter);
				setError(description);
				setErrorCode(result.error.code ?? "");
				toast.add({ type: "error", description, id: toastId });
				return;
			}
			if (sending) {
				setAddress(email);
				setSubmitted(true);
				setOtp("");
				setCooldowns((current) => ({ ...current, [email]: 60 }));
				toast.close(toastId);
			} else if (isReset) {
				toast.add({
					type: "success",
					description: t`Your password has been reset. You can now sign in with your new password.`,
					id: toastId,
				});
				props.onSuccess();
			} else {
				toast.close(toastId);
				await props.onSuccess(result.data);
			}
		} catch {
			setError(fallback);
			toast.add({ type: "error", description: fallback, id: toastId });
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}

	const submitCooldown = submitted ? verifyGlobalCooldown : sendCooldown;
	const duration = formatRetryAfterDuration(submitCooldown);
	return (
		<form
			className="grid gap-4"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				void submit(submitted ? "verify" : "send");
			}}
		>
			{submitted ? (
				<>
					<h2 className="text-center font-semibold text-xl">
						{isReset ? <Trans>Reset request submitted</Trans> : <Trans>Check your email</Trans>}
					</h2>
					<p className="text-muted-foreground text-sm">
						{isReset || props.disableSignups ? (
							<Trans>
								If an account exists for {email}, we'll send a 6-digit code to this address. Check your inbox and spam
								folder. The code expires in 10 minutes.
							</Trans>
						) : (
							<Trans>
								Your code request was submitted. Check the inbox and spam folder for {email}. The code expires in 10
								minutes.
							</Trans>
						)}
					</p>
					<div className="grid gap-2">
						<label htmlFor="email-code">
							<Trans>Verification code</Trans>
						</label>
						<OTPField id="email-code" length={6} name="otp" value={otp} onValueChange={setOtp} disabled={busy} />
					</div>
					{isReset && (
						<div className="grid gap-2">
							<label htmlFor="new-password">
								<Trans>New Password</Trans>
							</label>
							<div className="flex gap-2">
								<Input
									id="new-password"
									name="password"
									type={showPassword ? "text" : "password"}
									autoComplete="new-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={showPassword ? t`Hide password` : t`Show password`}
									onClick={() => setShowPassword(!showPassword)}
								>
									{showPassword ? <EyeSlashIcon /> : <EyeIcon />}
								</Button>
							</div>
						</div>
					)}
				</>
			) : (
				<>
					<div className="grid gap-2">
						<label htmlFor="otp-email">
							<Trans>Email Address</Trans>
						</label>
						<Input
							id="otp-email"
							type="email"
							name="email"
							autoComplete="email"
							disabled={busy}
							value={address}
							onChange={(event) => {
								setAddress(event.target.value);
								clearError();
							}}
						/>
					</div>
					{!isReset && (
						<p className="text-muted-foreground text-sm">
							{props.disableSignups ? (
								<Trans>Only existing accounts can sign in with a code.</Trans>
							) : (
								<Trans>New email addresses get an account after verification.</Trans>
							)}
						</p>
					)}
				</>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			{submitCooldown > 0 && (
				<p role="status">
					<Trans>Please wait {duration} before submitting another request.</Trans>
				</p>
			)}
			<Button type="submit" disabled={busy || submitCooldown > 0}>
				{submitCooldown > 0 ? (
					<Trans>Try again in {duration}</Trans>
				) : submitted ? (
					isReset ? (
						<Trans>Reset Password</Trans>
					) : (
						<Trans>Verify and sign in</Trans>
					)
				) : (
					<Trans>Get verification code</Trans>
				)}
			</Button>
			{submitted && (
				<div className="grid gap-2">
					{!isReset && errorCode === "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP" && (
						<Button type="button" onClick={() => props.onPassword(email)}>
							<Trans>Continue with password</Trans>
						</Button>
					)}
					<Button
						type="button"
						variant={errorCode === "OTP_EXPIRED" || errorCode === "TOO_MANY_ATTEMPTS" ? "default" : "outline"}
						disabled={busy || sendCooldown > 0}
						onClick={() => void submit("send")}
					>
						{sendCooldown > 0 ? (
							<Trans>Get a new code in {{ duration: formatRetryAfterDuration(sendCooldown) }}</Trans>
						) : (
							<Trans>Get a new code</Trans>
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						disabled={busy}
						onClick={() => {
							setSubmitted(false);
							setOtp("");
							setPassword("");
							setShowPassword(false);
							clearError();
						}}
					>
						<Trans>Edit email</Trans>
					</Button>
					{isReset && (
						<a className="text-center text-sm underline" href="mailto:">
							<Trans>Open Email Client</Trans>
						</a>
					)}
				</div>
			)}
		</form>
	);
}
