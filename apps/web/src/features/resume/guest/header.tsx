import { useLingui } from "@lingui/react/macro";
import { DotsThreeIcon, DownloadSimpleIcon, FileTextIcon, InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@reactive-resume/ui/components/popover";
import { useDialogStore } from "@/dialogs/store";
import { useResumeStore } from "../builder/draft";
import { ResumeDownloadDialog } from "../export/download-dialog";
import { useGuestEditor } from "./context";
import { guestDisclosure, guestStatuses, guestStorageNotice } from "./copy";
import { restoreLocalBackup } from "./snapshot";

export function GuestHeader() {
	const { i18n, t } = useLingui();
	const guest = useGuestEditor();
	const resume = useResumeStore((state) => state.resume);
	const [moreOpen, setMoreOpen] = useState(false);
	if (!guest) return null;
	const status = guestStatuses[guest.status as keyof typeof guestStatuses];
	const isSaveFailure = guest.status.startsWith("暂存失败");
	const backupLabel = t({ id: "guest.backup", message: "Export local backup" });
	return (
		<header className="absolute inset-x-0 top-0 z-50 flex h-14 items-center gap-1.5 border-b bg-popover px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
			<Popover>
				<PopoverTrigger
					render={
						<Button
							variant="ghost"
							className="min-w-0 flex-1 justify-start px-1 text-xs sm:flex-none sm:text-sm"
							aria-label={t({ id: "guest.help", message: "About local drafts" })}
						/>
					}
				>
					<FileTextIcon className="hidden shrink-0 sm:block" />
					<span className="min-w-0 text-start">
						<span className="block truncate font-medium">{t({ id: "guest.local", message: "Local draft" })}</span>
						<span role="status" title={guest.status} className="block truncate text-muted-foreground text-xs">
							{status ? i18n._(status) : guest.status}
						</span>
					</span>
					<InfoIcon className="hidden sm:block" />
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-4">
					<PopoverTitle>{t({ id: "guest.help", message: "About local drafts" })}</PopoverTitle>
					<PopoverDescription>{i18n._(guestDisclosure)}</PopoverDescription>
					<p className="text-muted-foreground">{i18n._(guestStorageNotice)}</p>
				</PopoverContent>
			</Popover>
			<div className="hidden sm:block sm:flex-1" />
			<Button
				size="sm"
				variant="outline"
				className="shrink-0 whitespace-nowrap px-2 text-xs sm:px-2.5 sm:text-sm"
				onClick={() => void guest.requestAction("save")}
			>
				{t({ id: "guest.saveAccount", message: "Save to account" })}
			</Button>
			<ResumeDownloadDialog
				resume={resume ?? undefined}
				trigger={(disabled) => (
					<Button
						size="sm"
						className="shrink-0 whitespace-nowrap px-2 text-xs sm:px-2.5 sm:text-sm"
						disabled={disabled}
					>
						<DownloadSimpleIcon className="hidden sm:inline" />
						{t({ id: "guest.formalExport", message: "Export resume" })}
					</Button>
				)}
			/>
			{isSaveFailure && (
				<Button size="sm" variant="outline" aria-label={backupLabel} onClick={() => void guest.backup()}>
					<DownloadSimpleIcon />
					<span className="hidden md:inline">{backupLabel}</span>
				</Button>
			)}
			<Popover open={moreOpen} onOpenChange={setMoreOpen}>
				<PopoverTrigger
					render={
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={t({ id: "guest.more", message: "More draft actions" })}
						/>
					}
				>
					<DotsThreeIcon className="size-5" />
				</PopoverTrigger>
				<PopoverContent align="end" className="gap-1 p-2">
					{!isSaveFailure && (
						<Button
							size="sm"
							variant="ghost"
							className="justify-start"
							onClick={() => {
								setMoreOpen(false);
								setTimeout(() => void guest.backup(), 0);
							}}
						>
							{backupLabel}
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						className="justify-start"
						onClick={() => {
							setMoreOpen(false);
							setTimeout(() => void guest.requestAction("print"), 0);
						}}
					>
						{t({ id: "guest.print", message: "Print" })}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="justify-start"
						onClick={() => {
							setMoreOpen(false);
							useDialogStore.getState().openDialog("resume.import", { onPrepared: guest.replaceData });
						}}
					>
						{t({ id: "guest.import", message: "Import" })}
					</Button>
					<label className="cursor-pointer rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
						{t({ id: "guest.restore", message: "Restore local backup" })}
						<input
							className="sr-only"
							type="file"
							accept=".json,application/json"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file)
									void file
										.text()
										.then(restoreLocalBackup)
										.then((value) => guest.replaceData(value.data, value.name))
										.catch(() =>
											window.alert(
												t({
													id: "guest.entry.failed",
													message: "Recovery did not finish. Existing data has not been replaced.",
												}),
											),
										);
								event.target.value = "";
							}}
						/>
					</label>
					<Button
						size="sm"
						variant="ghost"
						className="justify-start"
						onClick={() => {
							setMoreOpen(false);
							setTimeout(() => void guest.clear(), 0);
						}}
					>
						{t({ id: "guest.clear", message: "Clear local draft" })}
					</Button>
				</PopoverContent>
			</Popover>
		</header>
	);
}
