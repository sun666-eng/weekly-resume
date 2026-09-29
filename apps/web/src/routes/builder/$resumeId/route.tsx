import type { RecoverableDraft } from "@/features/resume/builder/draft";
import type { BuilderLayout } from "./-store/sidebar";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isEqual } from "es-toolkit";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "@reactive-resume/ui/components/button";
import {
	applyRecoveredDraft,
	bindRuntimeUser,
	discardRecoverableDraft,
	resolveResumeConflict,
	useBuilderResumeUpdateSubscription,
	useResumeCleanup,
	useResumeStore,
} from "@/features/resume/builder/draft";
import { loadRecoverableDrafts } from "@/features/resume/builder/draft-recovery";
import { orpc } from "@/libs/orpc/client";
import { createNoindexFollowMeta } from "@/libs/seo";
import { DesktopBuilderShell } from "./-components/desktop-builder-shell";
import { MobileBuilderShell } from "./-components/mobile-builder-shell";
import { getBuilderLayout } from "./-store/sidebar";

export const Route = createFileRoute("/builder/$resumeId")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/auth/login", replace: true });
		return { session: context.session };
	},
	loader: async ({ params, context }) => {
		const [layout, resume] = await Promise.all([
			getBuilderLayout(),
			context.queryClient.ensureQueryData(orpc.resume.getById.queryOptions({ input: { id: params.resumeId } })),
		]);

		return { layout, name: resume.name };
	},
	head: ({ loaderData }) => ({
		meta: loaderData
			? [{ title: `${loaderData.name} - Weekly Resume` }, createNoindexFollowMeta()]
			: [createNoindexFollowMeta()],
	}),
});

function RouteComponent() {
	const { layout: initialLayout } = Route.useLoaderData();
	const { session } = Route.useRouteContext();

	const { resumeId } = Route.useParams();
	const { data: resume } = useSuspenseQuery(orpc.resume.getById.queryOptions({ input: { id: resumeId } }));
	const initializeResumeStore = useResumeStore((state) => state.initialize);
	const mergeResumeMetadata = useResumeStore((state) => state.mergeResumeMetadata);
	const isReady = useResumeStore((state) => state.isReady);
	const initializedResumeId = useResumeStore((state) => state.resumeId);
	const isInitialized = isReady && initializedResumeId === resumeId;

	// Recovery drafts are scoped to this signed-in user; unbinding happens with the runtime cleanup.
	const [recoveries, setRecoveries] = useState<RecoverableDraft[]>([]);
	const [recovering, setRecovering] = useState(false);
	const checkedRecovery = useRef<string | null>(null);
	const saveConflict = useResumeStore((state) => state.saveConflict);
	const saveStatus = useResumeStore((state) => state.saveStatus);
	const recovery = recoveries[0];
	const userId = session?.user.id;

	useEffect(() => {
		if (!resumeId || !userId) return;
		bindRuntimeUser(resumeId, userId);
	}, [resumeId, userId]);

	useResumeCleanup();
	useBuilderResumeUpdateSubscription();

	useEffect(() => {
		if (isInitialized) return;
		initializeResumeStore(resume);
	}, [initializeResumeStore, isInitialized, resume]);

	useEffect(() => {
		mergeResumeMetadata(resume);
	}, [
		mergeResumeMetadata,
		resume.id,
		resume.name,
		resume.slug,
		resume.tags,
		resume.isLocked,
		resume.isPublic,
		resume.showDownloadButtons,
		resume.hasPassword,
		resume.updatedAt,
		resume,
	]);

	// Snapshot the recovery candidates once per route/user entry. Later saves must not reopen the prompt.
	useEffect(() => {
		if (!isInitialized || !resumeId || !userId) return;
		const key = `${userId}:${resumeId}`;
		if (checkedRecovery.current === key) return;
		checkedRecovery.current = key;
		setRecoveries(
			loadRecoverableDrafts(userId, resumeId).filter((draft) => {
				if (!isEqual(draft.data, resume.data)) return true;
				discardRecoverableDraft(resumeId, userId, draft.draftId);
				return false;
			}),
		);
	}, [isInitialized, resumeId, resume.data, userId]);

	if (!isInitialized) return null;

	if (saveConflict) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-6">
				<div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 shadow-sm" role="alert">
					<p className="font-medium">
						<Trans>Some changes conflict with a version saved elsewhere.</Trans>
					</p>
					<p className="text-muted-foreground text-sm">
						<Trans>
							Saving is paused. Choose which conflicting values to keep. Changes that do not conflict will be kept from
							both versions.
						</Trans>
					</p>
					{!saveConflict.baseData && (
						<p className="text-sm">
							<Trans>This older draft has no comparison version. Your choice will replace the complete resume.</Trans>
						</p>
					)}
					<div className="flex flex-wrap justify-end gap-2">
						<Button variant="outline" onClick={() => resolveResumeConflict("server")}>
							<Trans>Use server values</Trans>
						</Button>
						<Button onClick={() => resolveResumeConflict("local")}>
							<Trans>Keep my values</Trans>
						</Button>
					</div>
				</div>
			</div>
		);
	}
	if (recovery) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-6">
				<div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 shadow-sm">
					<div className="space-y-2">
						<p className="font-medium text-base">
							<Trans>Unsaved changes from your last visit were found.</Trans>
							<span className="ml-2 text-muted-foreground">({recoveries.length})</span>
						</p>
						<p className="text-muted-foreground text-sm leading-relaxed">
							<Trans>
								A draft was saved at {new Date(recovery.savedAt).toLocaleString()}. The version currently on the server
								was last saved at {new Date(resume.updatedAt).toLocaleString()}.
							</Trans>
						</p>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							disabled={recovering || saveStatus === "saving"}
							variant="outline"
							onClick={() => {
								discardRecoverableDraft(resumeId, recovery.userId, recovery.draftId);
								setRecoveries((drafts) => drafts.slice(1));
							}}
						>
							{t`Discard draft`}
						</Button>
						<Button
							disabled={recovering || saveStatus === "saving"}
							onClick={async () => {
								setRecovering(true);
								try {
									if (await applyRecoveredDraft(resumeId, recovery)) setRecoveries((drafts) => drafts.slice(1));
								} finally {
									setRecovering(false);
								}
							}}
						>
							{t`Recover draft`}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return <BuilderLayoutShell initialLayout={initialLayout} />;
}

function BuilderLayoutShell({ initialLayout }: { initialLayout: BuilderLayout }) {
	// Single breakpoint (below `md`) switches between the desktop resizable panels and the mobile tabbed shell.
	const isMobile = useMediaQuery("(max-width: 767px)", { initializeWithValue: false });

	if (isMobile) return <MobileBuilderShell />;
	return <DesktopBuilderShell initialLayout={initialLayout} />;
}
