import { Trans } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { EmailOtpForm } from "../components/email-otp-form";

type Props = { smtpEnabled: boolean };
export function ForgotPasswordPage({ smtpEnabled }: Props) {
	const navigate = useNavigate();
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

	return (
		<>
			<h1 className="text-center font-semibold text-2xl tracking-tight">
				<Trans>Forgot your password?</Trans>
			</h1>
			<EmailOtpForm mode="reset" onSuccess={() => void navigate({ to: "/auth/login", replace: true })} />
			<Link to="/auth/login" className={buttonVariants({ variant: "link" })}>
				<Trans>Back to sign in</Trans>
			</Link>
		</>
	);
}
