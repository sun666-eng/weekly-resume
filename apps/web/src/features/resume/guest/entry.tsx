import type { GuestEntryResult } from "./entry-state";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, FileTextIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { restoreGuestSnapshot } from "@reactive-resume/resume/guest-draft";
import { Button } from "@reactive-resume/ui/components/button";
import { orpc } from "@/libs/orpc/client";
import { prepareGuestEntry } from "./entry-state";
import { GuestRecoveryScreen, rawDownload } from "./recovery-screen";
import { downloadLocalBackup, restoreLocalBackup } from "./snapshot";

export function GuestLanding() {
	const { i18n, t } = useLingui();
	const navigate = useNavigate();
	const query = useQuery(orpc.resume.guestConfig.queryOptions());
	const [result, setResult] = useState<GuestEntryResult>();
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	// Root navigation reloads the catalog and replaces t even for the same locale.
	// Depend on the translated value so that one recovery cannot restart its own navigation.
	const recoveryFailure = t({
		id: "guest.entry.failed",
		message: "Recovery did not finish. Existing data has not been replaced.",
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries must re-read local storage even when config is unchanged.
	useEffect(() => {
		if (!query.data) return;
		let mounted = true;
		setResult(undefined);
		void prepareGuestEntry({ ...query.data, locale: i18n.locale })
			.then(async (value) => {
				if (!mounted) return;
				setResult(value);
				if (value.kind === "ready")
					await navigate({
						to: "/local-draft/edit/$resumeId",
						params: { resumeId: value.record.draftId },
						replace: true,
					});
			})
			.catch(() => {
				if (mounted) setError(recoveryFailure);
			});
		return () => {
			mounted = false;
		};
	}, [query.data, i18n.locale, navigate, retry, recoveryFailure]);

	const candidate = result?.kind === "unavailable" ? result.candidate : undefined;
	const loading = !error && !query.isError && (!result || result.kind === "ready");
	const description =
		error ||
		(query.isError
			? t({
					id: "guest.entry.configFailed",
					message: "The entry settings could not be loaded. Retry without changing your draft.",
				})
			: result?.kind === "unknown"
				? t({
						id: "guest.entry.unknown",
						message:
							"This draft format cannot be recovered here. The original record is preserved and can be retrieved.",
					})
				: result?.kind === "unavailable"
					? t({
							id: "guest.entry.unavailable",
							message:
								"Browser storage could not be read or saved. No existing draft has been replaced. Keep this page open if it contains unsaved content.",
						})
					: result?.kind === "disabled"
						? t({
								id: "guest.entry.disabled",
								message:
									"New guest drafts are currently disabled. Existing drafts can still be recovered; you can also restore a local backup.",
							})
						: result?.kind === "origin"
							? t({
									id: "guest.entry.origin",
									message:
										"Open the configured site before creating a draft. Browser drafts are not shared across site addresses.",
								})
							: t({ id: "guest.entry.loading", message: "Checking and restoring the draft in this browser…" }));
	return (
		<GuestRecoveryScreen loading={loading} description={description}>
			{!loading && (
				<>
					{result?.kind === "unknown" && (
						<Button onClick={() => rawDownload(result.raw)}>
							{t({ id: "guest.original", message: "Retrieve original record" })}
						</Button>
					)}
					{candidate && (
						<>
							<Button
								onClick={() =>
									void navigate({
										to: "/local-draft/edit/$resumeId",
										params: { resumeId: candidate.draftId },
										replace: true,
									})
								}
							>
								{t({ id: "guest.entry.memory", message: "Continue with the unsaved draft on this page" })}
							</Button>
							<Button
								variant="outline"
								onClick={() => {
									if (
										!window.confirm(
											t({
												id: "guest.backupWarning",
												message: "This backup includes personal information, photos and private notes. Keep it safe.",
											}),
										)
									)
										return;
									const value = restoreGuestSnapshot(candidate.snapshot);
									void downloadLocalBackup(value.name, value.data).catch(() =>
										setError(
											t({
												id: "guest.backupFailed",
												message:
													"Backup failed. Your content is still on this page and has not been protected. Keep this page open.",
											}),
										),
									);
								}}
							>
								{t({ id: "guest.backup", message: "Retrieve local backup" })}
							</Button>
						</>
					)}
					<Button
						variant="outline"
						onClick={() => {
							setError("");
							void query.refetch();
							setRetry((value) => value + 1);
						}}
					>
						{t({ id: "guest.retry", message: "Retry recovery" })}
					</Button>
					{result?.kind === "disabled" && (
						<label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
							<FileTextIcon />
							{t({ id: "guest.restore", message: "Restore local backup" })}
							<input
								type="file"
								accept=".json,application/json"
								className="sr-only"
								onChange={(event) => {
									const file = event.target.files?.[0];
									event.target.value = "";
									if (!file || !query.data) return;
									if (
										!window.confirm(
											t({
												id: "guest.restoreConfirm",
												message:
													"Restore this backup as a local draft? It will not be uploaded or claimed automatically.",
											}),
										)
									)
										return;
									const config = query.data;
									void file
										.text()
										.then(restoreLocalBackup)
										.then((restored) => prepareGuestEntry({ ...config, locale: i18n.locale }, restored))
										.then(async (value) => {
											setResult(value);
											if (value.kind === "ready")
												await navigate({
													to: "/local-draft/edit/$resumeId",
													params: { resumeId: value.record.draftId },
													replace: true,
												});
										})
										.catch(() =>
											setError(
												t({
													id: "guest.entry.failed",
													message: "Recovery did not finish. Existing data has not been replaced.",
												}),
											),
										);
								}}
							/>
						</label>
					)}
					{result?.kind === "origin" && query.data && (
						<a href={`${query.data.origin}/local-draft`} className="text-sm underline">
							{t({ id: "guest.canonical", message: "Open configured site" })}
						</a>
					)}
				</>
			)}
			<Link to="/" className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground">
				<ArrowLeftIcon />
				{t({ id: "guest.home", message: "Back to home" })}
			</Link>
		</GuestRecoveryScreen>
	);
}
