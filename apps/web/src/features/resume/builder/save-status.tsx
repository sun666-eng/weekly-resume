import { t } from "@lingui/core/macro";
import { CheckCircleIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@reactive-resume/ui/components/popover";
import { retryResumeSave, useResumeStore } from "./draft";

export function SaveStatusIndicator() {
	const status = useResumeStore((state) => state.saveStatus);
	const backup = useResumeStore((state) => state.draftBackupStatus);
	const hasConflict = useResumeStore((state) => state.saveConflict !== null);
	const isReady = useResumeStore((state) => state.isReady);
	if (!isReady) return null;

	let label = t`Saved`;
	let description = t`Your changes are saved to your account.`;
	let icon = <CheckCircleIcon />;
	if (status === "saving") {
		label = t`Saving…`;
		description = t`Your latest changes are being saved. Wait for “Saved” before closing this page.`;
		icon = <CircleNotchIcon className="animate-spin" />;
	} else if (status === "error") {
		label = hasConflict ? t`Resolve conflict` : backup === "saved" ? t`Saved locally` : t`Not saved`;
		description =
			backup === "saved"
				? t`Your latest changes are backed up in this browser, but are not saved to your account. Keep this page open and resolve the save error. Other devices cannot see these changes yet.`
				: t`Your latest changes are not backed up. Keep this page open until saving succeeds.`;
		icon = <WarningCircleIcon className="text-destructive" />;
	}

	return (
		<Popover>
			<div
				role="status"
				aria-live="polite"
				className="absolute end-2 top-14 rounded-md border bg-popover shadow-sm md:static md:ms-1 md:border-0 md:shadow-none"
			>
				<PopoverTrigger className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs focus-visible:outline-2 focus-visible:outline-ring">
					{icon}
					<span>{label}</span>
				</PopoverTrigger>
			</div>
			<PopoverContent align="end">
				<PopoverTitle>{label}</PopoverTitle>
				<PopoverDescription>{description}</PopoverDescription>
				{status === "error" && !hasConflict && (
					<Button type="button" size="sm" onClick={retryResumeSave}>{t`Retry saving`}</Button>
				)}
			</PopoverContent>
		</Popover>
	);
}
