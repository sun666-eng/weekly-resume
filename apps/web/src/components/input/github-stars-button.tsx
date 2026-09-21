import { t } from "@lingui/core/macro";
import { GithubLogoIcon, StarIcon } from "@phosphor-icons/react";
import { Button } from "@reactive-resume/ui/components/button";

export const WEEKLY_RESUME_REPOSITORY_URL = "https://github.com/sun666-eng/weekly-resume";

type GithubStarsButtonProps = {
	className?: string;
};

export function GithubStarsButton({ className }: GithubStarsButtonProps = {}) {
	return (
		<Button
			className={className}
			variant="outline"
			nativeButton={false}
			render={
				<a
					target="_blank"
					href={WEEKLY_RESUME_REPOSITORY_URL}
					aria-label={t`Star us on GitHub (opens in new tab)`}
					rel="noopener noreferrer"
				>
					<GithubLogoIcon aria-hidden="true" />
					<span>Star</span>
					<StarIcon aria-hidden="true" />
				</a>
			}
		/>
	);
}
