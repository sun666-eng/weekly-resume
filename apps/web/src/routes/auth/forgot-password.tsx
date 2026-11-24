import { createFileRoute, redirect } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password";

export const Route = createFileRoute("/auth/forgot-password")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.flags.disableEmailAuth) throw redirect({ to: "/auth/login", replace: true });
	},
});

function RouteComponent() {
	const { flags } = Route.useRouteContext();
	return <ForgotPasswordPage smtpEnabled={flags.smtpEnabled} />;
}
