import { t } from "@lingui/core/macro";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, Outlet, useSearch } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";

function extractLocalDraftId(callbackURL?: string): string | undefined {
	if (!callbackURL) return;
	const pathname = callbackURL.split(/[?#]/, 1)[0] ?? "";
	const match = /^\/local-draft\/edit\/([^/]+)$/.exec(pathname);
	return match?.[1];
}

export function AuthLayout() {
	const { callbackURL } = useSearch({ from: "/auth" });
	const localDraftId = extractLocalDraftId(callbackURL);
	const isLocalDraftEntry = callbackURL?.split(/[?#]/, 1)[0] === "/local-draft";

	return (
		<div className="fade-in-0 slide-in-from-top-4 mx-auto flex min-h-svh w-dvw max-w-sm animate-in flex-col justify-center gap-y-6 px-4 xs:px-0 py-8 duration-300 ease-(--ease-out-strong)">
			<Link to="/" aria-label={t`Go to homepage`} className="mb-2 self-center transition-opacity hover:opacity-80">
				<BrandIcon className="size-16" />
			</Link>

			<Outlet />

			<div className="pt-2 text-center">
				{localDraftId ? (
					<Link
						to="/local-draft/edit/$resumeId"
						params={{ resumeId: localDraftId }}
						className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						<span>{t({ id: "auth.backToDraft", message: "Back to local draft" })}</span>
					</Link>
				) : isLocalDraftEntry ? (
					<Link
						to="/local-draft"
						className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						<span>{t({ id: "auth.backToDraft", message: "Back to local draft" })}</span>
					</Link>
				) : (
					<Link
						to="/"
						className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						<span>{t({ id: "auth.backToHome", message: "Back to home" })}</span>
					</Link>
				)}
			</div>
		</div>
	);
}
