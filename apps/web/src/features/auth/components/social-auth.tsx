import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { FingerprintIcon, GithubLogoIcon, GoogleLogoIcon, LinkedinLogoIcon, VaultIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { Button } from "@reactive-resume/ui/components/button";
import { Skeleton } from "@reactive-resume/ui/components/skeleton";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { authClient } from "@/libs/auth/client";
import { orpc } from "@/libs/orpc/client";
import { getAuthErrorMessage } from "../error-message";
import { getAuthRedirectOptions, getOAuthPasskeyOptions, getOAuthSignInOptions, isOAuthRedirect } from "../redirect";

const PROVIDER_KEYS = ["custom", "passkey", "google", "github", "linkedin"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];

export function SocialAuth() {
	const { data: providers = {}, isLoading } = useQuery(orpc.auth.providers.list.queryOptions());
	const activeKeys = PROVIDER_KEYS.filter((key) => key in providers);

	if (!isLoading && activeKeys.length === 0) return null;

	return (
		<>
			<div className="flex items-center gap-x-2">
				<hr className="flex-1" />
				<span className="font-medium text-xs tracking-wide">
					<Trans context="Choose to authenticate with a social provider (Google, GitHub, etc.) instead of email and password">
						or continue with
					</Trans>
				</span>
				<hr className="flex-1" />
			</div>

			{isLoading ? <SocialAuthSkeleton /> : <SocialAuthButtons providers={providers} activeKeys={activeKeys} />}
		</>
	);
}

function SocialAuthSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-4">
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-9 w-full" />
		</div>
	);
}

type SocialAuthButtonsProps = {
	providers: RouterOutput["auth"]["providers"]["list"];
	activeKeys: ProviderKey[];
};

function SocialAuthButtons({ providers, activeKeys }: SocialAuthButtonsProps) {
	const router = useRouter();
	const { callbackURL } = useSearch({ from: "/auth" });
	const isOddMultiGrid = activeKeys.length > 1 && activeKeys.length % 2 === 1;
	const lastActiveKey = activeKeys.at(-1);
	const spanClass = (key: ProviderKey) => (isOddMultiGrid && lastActiveKey === key ? "col-span-2" : undefined);

	const runSignIn = async (
		fn: () => Promise<{ data?: unknown; error: { message?: string } | null }>,
		isPasskey = false,
	) => {
		const toastId = toast.add({ type: "loading", description: t`Signing in...` });
		const { data, error } = await fn();
		if (error) {
			toast.add({
				type: "error",
				description: getAuthErrorMessage(
					error,
					t({
						comment: "Fallback toast when sign-in fails without an error message",
						message: "Failed to sign in. Please try again.",
					}),
				),
				id: toastId,
			});
			return;
		}
		toast.close(toastId);
		if (isOAuthRedirect(data)) return;
		await router.invalidate();
		if (isPasskey) void router.navigate(getAuthRedirectOptions(callbackURL));
	};

	return (
		<div className={cn("grid gap-4", activeKeys.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
			<Button
				variant="secondary"
				onClick={() =>
					runSignIn(() =>
						authClient.signIn.social({
							provider: "custom",
							callbackURL: callbackURL ?? "/dashboard",
							...getOAuthSignInOptions(callbackURL),
						}),
					)
				}
				className={cn("hidden", "custom" in providers && "inline-flex", spanClass("custom"))}
			>
				<VaultIcon />
				{providers.custom}
			</Button>

			<Button
				variant="secondary"
				onClick={() =>
					runSignIn(() => authClient.signIn.passkey({ autoFill: false, ...getOAuthPasskeyOptions(callbackURL) }), true)
				}
				className={cn("hidden", "passkey" in providers && "inline-flex", spanClass("passkey"))}
			>
				<FingerprintIcon />
				<Trans comment="Label for passkey sign-in button">Passkey</Trans>
			</Button>

			<Button
				onClick={() =>
					runSignIn(() =>
						authClient.signIn.social({
							provider: "google",
							callbackURL: callbackURL ?? "/dashboard",
							...getOAuthSignInOptions(callbackURL),
						}),
					)
				}
				className={cn(
					"hidden flex-1 bg-[#4285F4] text-white hover:bg-[#4285F4]/80",
					"google" in providers && "inline-flex",
					spanClass("google"),
				)}
			>
				<GoogleLogoIcon />
				<Trans comment="Brand name label for Google social sign-in button">Google</Trans>
			</Button>

			<Button
				onClick={() =>
					runSignIn(() =>
						authClient.signIn.social({
							provider: "github",
							callbackURL: callbackURL ?? "/dashboard",
							...getOAuthSignInOptions(callbackURL),
						}),
					)
				}
				className={cn(
					"hidden flex-1 bg-[#2b3137] text-white hover:bg-[#2b3137]/80",
					"github" in providers && "inline-flex",
					spanClass("github"),
				)}
			>
				<GithubLogoIcon />
				<Trans comment="Brand name label for GitHub social sign-in button">GitHub</Trans>
			</Button>

			<Button
				onClick={() =>
					runSignIn(() =>
						authClient.signIn.social({
							provider: "linkedin",
							callbackURL: callbackURL ?? "/dashboard",
							...getOAuthSignInOptions(callbackURL),
						}),
					)
				}
				className={cn(
					"hidden flex-1 bg-[#0A66C2] text-white hover:bg-[#0A66C2]/80",
					"linkedin" in providers && "inline-flex",
					spanClass("linkedin"),
				)}
			>
				<LinkedinLogoIcon />
				<Trans comment="Brand name label for LinkedIn social sign-in button">LinkedIn</Trans>
			</Button>
		</div>
	);
}
