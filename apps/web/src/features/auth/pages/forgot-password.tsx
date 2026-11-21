import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import { toast } from "@reactive-resume/ui/components/toast";
import { authClient, getRetryAfterSecondsFromAuthContext } from "@/libs/auth/client";
import { useAppForm } from "@/libs/tanstack-form";
import { formatRetryAfterDuration, getAuthErrorMessage, isAuthRateLimitError } from "../error-message";

const formSchema = z.object({
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email({ error: () => t`Enter a valid email address.` })),
});

const DEFAULT_COOLDOWN_SECONDS = 60;

type Props = {
	smtpEnabled: boolean;
};

export function ForgotPasswordPage({ smtpEnabled }: Props) {
	const [submittedEmail, setSubmittedEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submissionCooldownSeconds, setSubmissionCooldownSeconds] = useState(0);
	const [rateLimitCooldownSeconds, setRateLimitCooldownSeconds] = useState(0);
	const isCoolingDown = submissionCooldownSeconds > 0 || rateLimitCooldownSeconds > 0;
	const getCooldownSeconds = (normalizedEmail: string) =>
		Math.max(rateLimitCooldownSeconds, normalizedEmail === submittedEmail ? submissionCooldownSeconds : 0);

	useEffect(() => {
		if (!isCoolingDown) return;
		const timer = window.setInterval(() => {
			setSubmissionCooldownSeconds((remaining) => Math.max(remaining - 1, 0));
			setRateLimitCooldownSeconds((remaining) => Math.max(remaining - 1, 0));
		}, 1000);
		return () => window.clearInterval(timer);
	}, [isCoolingDown]);

	const submitResetRequest = async (email: string) => {
		const normalizedEmail = email.trim().toLowerCase();
		if (isSubmitting || getCooldownSeconds(normalizedEmail) > 0) return;

		const toastId = toast.add({ type: "loading", description: t`Submitting password reset request...` });
		let retryAfterSeconds: number | undefined;
		setIsSubmitting(true);

		try {
			const { error } = await authClient.requestPasswordReset({
				email: normalizedEmail,
				redirectTo: "/auth/reset-password",
				fetchOptions: {
					onError: (context) => {
						retryAfterSeconds = getRetryAfterSecondsFromAuthContext(context);
					},
				},
			});

			if (error) {
				const rateLimited = isAuthRateLimitError(error);
				if (rateLimited) setRateLimitCooldownSeconds(retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS);
				toast.add({
					type: "error",
					description: getAuthErrorMessage(
						error,
						t({
							comment: "Fallback toast when requesting a password reset fails without backend message",
							message: "Could not submit your password reset request. Please try again.",
						}),
						retryAfterSeconds,
					),
					id: toastId,
				});
				return;
			}

			setSubmittedEmail(normalizedEmail);
			setSubmitted(true);
			setSubmissionCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);
			toast.close(toastId);
		} catch {
			toast.add({
				type: "error",
				description: t`Could not submit your password reset request. Check your connection and try again.`,
				id: toastId,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const form = useAppForm({
		defaultValues: { email: "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => submitResetRequest(value.email),
	});
	const normalizedEmail = useStore(form.store, (state) => state.values.email.trim().toLowerCase());
	const cooldownSeconds = getCooldownSeconds(normalizedEmail);

	if (!smtpEnabled) {
		return (
			<>
				<div className="space-y-1 text-center">
					<h1 className="font-semibold text-2xl tracking-tight">
						<Trans>Forgot your password?</Trans>
					</h1>
				</div>
				<Alert>
					<WarningCircleIcon />
					<AlertTitle>
						<Trans>Email service is not configured</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>This instance cannot send password reset emails. Contact the administrator for help.</Trans>
					</AlertDescription>
				</Alert>
				<Link to="/auth/login" className={buttonVariants({ variant: "secondary" })}>
					<Trans>Back to sign in</Trans>
				</Link>
			</>
		);
	}

	if (submitted) {
		return (
			<PostForgotPasswordScreen
				email={submittedEmail}
				cooldownSeconds={getCooldownSeconds(submittedEmail)}
				isSubmitting={isSubmitting}
				onEditEmail={() => {
					form.setFieldValue("email", submittedEmail);
					setSubmitted(false);
				}}
				onResubmit={() => submitResetRequest(submittedEmail)}
			/>
		);
	}

	return (
		<>
			<div className="space-y-1 text-center">
				<h1 className="font-semibold text-2xl tracking-tight">
					<Trans>Forgot your password?</Trans>
				</h1>

				<div className="text-muted-foreground">
					<Trans>
						Remember your password?{" "}
						<Button
							variant="link"
							className="h-auto gap-1.5 px-1! py-0"
							nativeButton={false}
							render={
								<Link to="/auth/login">
									<Trans comment="Call-to-action link from forgot-password page to login page">Sign in now</Trans>{" "}
									<ArrowRightIcon />
								</Link>
							}
						/>
					</Trans>
				</div>
			</div>

			<form
				className="space-y-6"
				noValidate
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="email">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans comment="Label for email input on forgot-password form">Email Address</Trans>
							</FormLabel>
							<FormControl
								render={
									<Input
										type="email"
										autoComplete="email"
										placeholder="john.doe@example.com"
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>

				{cooldownSeconds > 0 && (
					<p className="text-center text-muted-foreground text-sm" role="status">
						<Trans>Please wait {formatRetryAfterDuration(cooldownSeconds)} before submitting another request.</Trans>
					</p>
				)}

				<Button type="submit" className="w-full" disabled={isSubmitting || cooldownSeconds > 0}>
					{cooldownSeconds > 0 ? (
						<Trans>Try again in {formatRetryAfterDuration(cooldownSeconds)}</Trans>
					) : (
						<Trans comment="Primary action button label on forgot-password form">Send Password Reset Email</Trans>
					)}
				</Button>
			</form>
		</>
	);
}

type PostForgotPasswordScreenProps = {
	email: string;
	cooldownSeconds: number;
	isSubmitting: boolean;
	onEditEmail: () => void;
	onResubmit: () => void;
};

function PostForgotPasswordScreen({
	email,
	cooldownSeconds,
	isSubmitting,
	onEditEmail,
	onResubmit,
}: PostForgotPasswordScreenProps) {
	return (
		<>
			<div className="space-y-1 text-center">
				<h1 className="font-semibold text-2xl tracking-tight">
					<Trans>Reset request submitted</Trans>
				</h1>
				<p className="text-muted-foreground">
					<Trans>
						If an account exists for {email}, we'll send a password reset link to this address. Check your inbox and
						spam folder. The link is valid for 1 hour.
					</Trans>
				</p>
			</div>

			<div className="grid gap-3">
				<Button type="button" variant="outline" onClick={onEditEmail} disabled={isSubmitting}>
					<Trans>Edit email</Trans>
				</Button>
				<Button type="button" onClick={onResubmit} disabled={isSubmitting || cooldownSeconds > 0}>
					{cooldownSeconds > 0 ? (
						<Trans>Resubmit request in {formatRetryAfterDuration(cooldownSeconds)}</Trans>
					) : (
						<Trans>Resubmit request</Trans>
					)}
				</Button>
				<Button
					variant="secondary"
					nativeButton={false}
					render={
						<a href="mailto:">
							<Trans comment="Button label to open the user's default email app">Open Email Client</Trans>
						</a>
					}
				/>
				<Link to="/auth/login" className={buttonVariants({ variant: "link" })}>
					<Trans>Back to sign in</Trans>
				</Link>
			</div>
		</>
	);
}
