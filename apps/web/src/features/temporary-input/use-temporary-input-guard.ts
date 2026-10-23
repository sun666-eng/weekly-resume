import type { RouterHistory } from "@tanstack/react-router";
import { t } from "@lingui/core/macro";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useConfirm } from "@/hooks/use-confirm";

type TemporaryInputGuardOptions = {
	hasTemporaryInput: boolean;
	loginRequired: boolean;
};

/** Only for the public sample/checker pages. This protects navigation; it does not save input. */
export function useTemporaryInputGuard({ hasTemporaryInput, loginRequired }: TemporaryInputGuardOptions) {
	const confirm = useConfirm();
	const router = useRouter();
	const pending = useRef(false);

	useEffect(() => {
		if (!hasTemporaryInput) return;
		let active = true;
		let repeatedTraversal = false;
		const history: RouterHistory = router.history;
		const unblock = history.block({
			enableBeforeUnload: true,
			blockerFn: async ({ currentLocation, nextLocation, action }) => {
				if (currentLocation.pathname === nextLocation.pathname) return false;
				const isTraversal = action === "BACK" || action === "FORWARD" || action === "GO";
				if (pending.current) {
					if (isTraversal) repeatedTraversal = true;
					return true;
				}
				pending.current = true;
				repeatedTraversal = false;
				const previousFocus = document.activeElement;
				const goesToLogin =
					nextLocation.pathname === "/auth/login" ||
					(loginRequired &&
						(nextLocation.pathname === "/dashboard" || nextLocation.pathname.startsWith("/dashboard/")));

				try {
					const leave = await confirm(t`Leave this page?`, {
						description: goesToLogin
							? t`Signing in will not carry over this sample or analysis. Your temporary inputs and results are not saved and will not be restored after leaving. Continue to sign in?`
							: t`Your temporary inputs and results are not saved and will not be restored after leaving or refreshing. Leave this page?`,
						cancelText: t`Stay on this page`,
						confirmText: t`Leave anyway`,
					});
					if (!active) return true;
					if (!leave) {
						if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
						return true;
					}
					// A later blocked traversal can roll back the first native traversal too.
					// Resume only its captured index, once, after explicit confirmation.
					if (isTraversal && repeatedTraversal) {
						const index: unknown = window.history.state?.__TSR_index;
						if (typeof index === "number") {
							const delta = nextLocation.state.__TSR_index - index;
							if (delta !== 0) history.go(delta, { ignoreBlocker: true });
						}
					}
					return false;
				} finally {
					pending.current = false;
				}
			},
		});
		return () => {
			active = false;
			unblock();
		};
	}, [hasTemporaryInput, loginRequired, confirm, router]);
}
