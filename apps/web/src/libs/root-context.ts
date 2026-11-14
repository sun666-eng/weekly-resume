import type { AuthSession } from "@reactive-resume/auth/types";
import { authClient } from "./auth/client";
import { getSession } from "./auth/session";
import { getLocale, loadLocale } from "./locale";
import { client } from "./orpc/client";
import { getTheme } from "./theme";

let bootstrapped = false;
let stopBootstrapSession: (() => void) | undefined;

export function releaseBootstrapSession() {
	stopBootstrapSession?.();
	stopBootstrapSession = undefined;
}

function loadSession() {
	if (typeof window === "undefined" || bootstrapped) return getSession();
	bootstrapped = true;
	// Use the same observable as useSession(), including its normal refresh/error
	// handling. Keep it mounted until React subscribes, even on a slow locale load.
	return new Promise<AuthSession | null>((resolve) => {
		stopBootstrapSession = authClient.$store.atoms.session.subscribe((state) => {
			if (!state.isPending && !state.isRefetching) resolve(state.error ? null : (state.data as AuthSession | null));
		});
	});
}

export async function loadRootContext() {
	const [theme, locale, session, flags] = await Promise.all([
		getTheme(),
		getLocale(),
		loadSession(),
		client.flags.get(),
	]);

	await loadLocale(locale);

	return { theme, locale, session, flags };
}
