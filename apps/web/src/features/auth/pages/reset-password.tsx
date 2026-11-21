import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, EyeIcon, EyeSlashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useToggle } from "usehooks-ts";
import z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import { toast } from "@reactive-resume/ui/components/toast";
import { authClient } from "@/libs/auth/client";
import { useAppForm } from "@/libs/tanstack-form";
import { getAuthErrorMessage, isInvalidResetTokenError } from "../error-message";

const formSchema = z.object({
	password: z
		.string()
		.min(8, { error: () => t`Password must be at least 8 characters.` })
		.max(64, { error: () => t`Password must be at most 64 characters.` }),
});

type Props = {
	token?: string;
	error?: string;
};

export function ResetPasswordPage({ token, error }: Props) {
	const navigate = useNavigate();
	const [showPassword, toggleShowPassword] = useToggle(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [invalidatedToken, setInvalidatedToken] = useState<string | null>(null);
	const isCredentialInvalid = Boolean(error) || !token?.trim() || invalidatedToken === token;

	const form = useAppForm({
		defaultValues: { password: "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			if (isSubmitting || isCredentialInvalid || !token) return;
			setIsSubmitting(true);
			const toastId = toast.add({ type: "loading", description: t`Updating your password...` });

			try {
				const { error: resetError } = await authClient.resetPassword({ newPassword: value.password, token });
				if (resetError) {
					if (isInvalidResetTokenError(resetError)) setInvalidatedToken(token);
					toast.add({
						type: "error",
						description: getAuthErrorMessage(
							resetError,
							t({
								comment: "Fallback toast shown when password reset fails",
								message: "Could not reset your password. Please try again.",
							}),
						),
						id: toastId,
					});
					return;
				}

				toast.add({
					type: "success",
					description: t`Your password has been reset. You can now sign in with your new password.`,
					id: toastId,
				});
				void navigate({ to: "/auth/login", replace: true });
			} catch {
				toast.add({
					type: "error",
					description: t`Could not reset your password. Check your connection and try again.`,
					id: toastId,
				});
			} finally {
				setIsSubmitting(false);
			}
		},
	});

	if (isCredentialInvalid) {
		return (
			<>
				<div className="space-y-1 text-center">
					<h1 className="font-semibold text-2xl tracking-tight">
						<Trans>Reset link unavailable</Trans>
					</h1>
				</div>
				<Alert>
					<WarningCircleIcon />
					<AlertTitle>
						<Trans>This password reset link is invalid or has expired.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>
							The link may have expired after 1 hour or already been used. Request a new password reset link to
							continue.
						</Trans>
					</AlertDescription>
				</Alert>
				<div className="grid gap-3">
					<Button nativeButton={false} render={<Link to="/auth/forgot-password" />}>
						<Trans>Request a new password reset</Trans>
						<ArrowRightIcon />
					</Button>
					<Link to="/auth/login" className={buttonVariants({ variant: "secondary" })}>
						<Trans>Back to sign in</Trans>
					</Link>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="space-y-1 text-center">
				<h1 className="font-semibold text-2xl tracking-tight">
					<Trans>Reset your password</Trans>
				</h1>
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
				<form.Field name="password">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>New Password</Trans>
							</FormLabel>
							<div className="flex items-center gap-x-1.5">
								<FormControl
									render={
										<Input
											minLength={8}
											type={showPassword ? "text" : "password"}
											autoComplete="new-password"
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									}
								/>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onClick={toggleShowPassword}
									aria-label={
										showPassword
											? t({
													comment: "Accessible label for button that hides password in reset form",
													message: "Hide password",
												})
											: t({
													comment: "Accessible label for button that reveals password in reset form",
													message: "Show password",
												})
									}
								>
									{showPassword ? <EyeIcon /> : <EyeSlashIcon />}
								</Button>
							</div>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>

				<Button type="submit" className="w-full" disabled={isSubmitting}>
					<Trans>Reset Password</Trans>
				</Button>
			</form>
		</>
	);
}
