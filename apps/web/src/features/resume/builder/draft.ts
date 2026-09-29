import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { WritableDraft } from "immer";
import type { RecoverableDraft } from "./draft-recovery";
import { t } from "@lingui/core/macro";
import { consumeEventIterator, ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useParams } from "@tanstack/react-router";
import { debounce, isEqual } from "es-toolkit";
import { useCallback, useEffect, useState } from "react";
import { immer } from "zustand/middleware/immer";
import { create } from "zustand/react";
import { mergeResumeVersions } from "@reactive-resume/resume/merge";
import { toast } from "@reactive-resume/ui/components/toast";
import { orpc, streamClient } from "@/libs/orpc/client";
import { clearRecoverableDraft, loadRecoverableDraft, saveRecoverableDraft } from "./draft-recovery";

export type Resume = {
	id: string;
	name: string;
	slug: string;
	tags: string[];
	data: ResumeData;
	isLocked: boolean;
	updatedAt: Date;
	hasPassword?: boolean;
	isPublic?: boolean;
	showDownloadButtons?: boolean;
};

// Mirrors the server-side ResumeUpdatedEvent discriminator (packages/api resume/events.ts).
type ResumeUpdateMutation = "sync" | "create" | "update" | "patch" | "lock" | "password" | "delete";
type ResumeUpdateEvent = { mutation: ResumeUpdateMutation };

type SaveStatus = "idle" | "saving" | "saved" | "error";

type ResumeStoreState = {
	resume: Resume | null;
	resumeId?: string;
	isReady: boolean;
	saveStatus: SaveStatus;
	saveConflict: { baseData?: ResumeData; server: Resume } | null;
	// Client-side undo/redo stacks holding whole-`ResumeData` snapshots (see recordHistory helpers below).
	undoStack: ResumeData[];
	redoStack: ResumeData[];
	canUndo: boolean;
	canRedo: boolean;
};

type ResumeStoreActions = {
	initialize: (resume: Resume | null) => void;
	reset: () => void;
	replaceResumeDraft: (resume: Resume) => void;
	replaceResumeFromServer: (resume: Resume) => void;
	updateResumeData: (fn: (draft: WritableDraft<ResumeData>) => void) => void;
	patchResume: (fn: (draft: WritableDraft<Resume>) => void) => void;
	mergeResumeMetadata: (resume: Resume) => void;
	setSaveStatus: (status: SaveStatus) => void;
	undo: () => void;
	redo: () => void;
};

type ResumeStore = ResumeStoreState & ResumeStoreActions;

type Runtime = {
	abortController: AbortController;
	queryClient?: QueryClient;
	/** Set by the builder route; scopes crash-recovery drafts to the signed-in user. */
	userId?: string;
	/** The server data/updatedAt the pending local edits were built on (optimistic-lock base). */
	baseData?: ResumeData;
	baseUpdatedAt?: string;
	baseRetryCount?: number;
	stashedDraft?: RecoverableDraft;
	recoveredDraft?: RecoverableDraft;
	backupErrorToastId?: string;
	hasPendingLocalChanges: boolean;
	isSaving: boolean;
	pendingResume?: Resume;
	syncErrorToastId?: string;
	slowSaveToastId?: string;
	syncResume: ReturnType<typeof debounce<(resume: Resume) => void>>;
	beforeUnloadHandler?: () => void;
	deferredRemoteResume?: Resume;
	deferredFocusHandler?: () => void;
};

type ResumeUpdateSubscriptionOptions = {
	resumeId?: string;
	onUpdate: (event: ResumeUpdateEvent) => Promise<void> | void;
	onError?: (error: unknown) => void;
};

const SAVE_DEBOUNCE_MS = 500;
const NAVIGATION_SAVE_WAIT_MS = 10_000;
// Rapid edits within this window coalesce into a single undo step (e.g. typing a word / dragging).
const HISTORY_COALESCE_MS = 500;
// Bounded stacks: keep undo/redo memory (whole-resume snapshots) predictable during a long session.
const MAX_HISTORY_ENTRIES = 50;
const runtimes = new Map<string, Runtime>();

// Coalescing bookkeeping. Not reactive — only decides whether the next edit opens a new undo step.
let historyLastEditAt = 0;
let historyCanCoalesce = false;

function resetHistoryRuntime() {
	historyLastEditAt = 0;
	historyCanCoalesce = false;
}

let lockedToastId: string | undefined;

function getResumeQueryKey(id: string): QueryKey {
	return orpc.resume.getById.queryOptions({ input: { id } }).queryKey as QueryKey;
}

function cloneResumeData(data: ResumeData): ResumeData {
	return structuredClone(data);
}

function cloneResume(resume: Resume): Resume {
	return { ...resume, data: cloneResumeData(resume.data) };
}

export function isEditableElementFocused(): boolean {
	if (typeof document === "undefined") return false;
	const element = document.activeElement as HTMLElement | null;
	if (!element) return false;
	return (
		element.tagName === "INPUT" ||
		element.tagName === "TEXTAREA" ||
		element.tagName === "SELECT" ||
		element.isContentEditable ||
		element.closest(".cm-editor") !== null
	);
}

function externalUpdateMessage(mutation: ResumeUpdateMutation): string {
	if (mutation === "patch") return t`This resume was updated by an AI agent.`;
	if (mutation === "lock" || mutation === "password") return t`This resume's sharing settings changed elsewhere.`;
	return t`Synced changes made in another tab.`;
}

function notifyExternalUpdate(mutation: ResumeUpdateMutation) {
	toast.add({ type: "info", description: externalUpdateMessage(mutation), id: "resume-external-update" });
}

// #54: applies a remote update that was deferred because the user was typing.
function applyDeferredRemoteResume(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime?.deferredRemoteResume) return;

	const resume = runtime.deferredRemoteResume;
	runtime.deferredRemoteResume = undefined;
	if (runtime.deferredFocusHandler && typeof document !== "undefined") {
		document.removeEventListener("focusout", runtime.deferredFocusHandler, true);
		runtime.deferredFocusHandler = undefined;
	}

	// The user may have started editing again while the update was deferred; local edits win.
	if (runtime.hasPendingLocalChanges) return;

	useResumeStore.getState().replaceResumeFromServer(resume);
	notifyExternalUpdate("update");
}

// #54: don't overwrite a focused field mid-keystroke; stash the remote resume and apply it on blur.
function deferRemoteResumeUntilBlur(id: string, resume: Resume) {
	const runtime = getRuntime(id);
	runtime.deferredRemoteResume = resume;

	if (runtime.deferredFocusHandler || typeof document === "undefined") return;

	const handler = () => {
		// Let focus settle (e.g. tabbing between fields) before deciding editing has ended.
		window.setTimeout(() => {
			if (isEditableElementFocused()) return;
			applyDeferredRemoteResume(id);
		}, 0);
	};

	runtime.deferredFocusHandler = handler;
	document.addEventListener("focusout", handler, true);
}

function setRuntimeBaseline(resume: Resume) {
	const runtime = getRuntime(resume.id);
	runtime.hasPendingLocalChanges = false;
	runtime.pendingResume = undefined;
}

/**
 * Mirrors the newest local state into localStorage so the edit survives the events that kill the
 * in-memory runtime: a reload, the auth redirect to /auth/login, or any navigation while a save
 * is failing. Scoped to the signed-in user (no-op until the route binds one).
 */
function stashRecoverableDraft(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime?.userId || !runtime.hasPendingLocalChanges) return;

	const current = useResumeStore.getState().resume;
	if (!current || current.id !== id) return;

	const saved = saveRecoverableDraft({
		userId: runtime.userId,
		resumeId: id,
		baseUpdatedAt: runtime.baseUpdatedAt ?? null,
		baseData: runtime.baseData,
		data: current.data,
	});
	if (saved) {
		if (runtime.stashedDraft) clearRecoverableDraft(runtime.userId, id, runtime.stashedDraft.draftId);
		runtime.stashedDraft = saved;
		if (runtime.backupErrorToastId) toast.close(runtime.backupErrorToastId);
		runtime.backupErrorToastId = undefined;
	} else {
		runtime.backupErrorToastId = toast.add({
			type: "error",
			timeout: 0,
			id: runtime.backupErrorToastId,
			description: t`A local backup could not be saved. Keep this page open until saving succeeds.`,
		});
	}
	return Boolean(saved);
}

function clearStashedDraft(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime?.userId) return;
	for (const draft of [runtime.stashedDraft, runtime.recoveredDraft]) {
		if (draft) clearRecoverableDraft(runtime.userId, id, draft.draftId);
	}
	runtime.stashedDraft = undefined;
	runtime.recoveredDraft = undefined;
}

/**
 * Records the server version the local document is now based on. It is the optimistic-lock
 * base for the next full-document save and the merge base when a conflict comes back.
 */
function markRuntimeSynced(id: string, resume: Resume) {
	const runtime = getRuntime(id);
	runtime.baseData = cloneResumeData(resume.data);
	runtime.baseUpdatedAt = new Date(resume.updatedAt).toISOString();
	runtime.baseRetryCount = 0;
}

async function flushResumeSave(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime || runtime.isSaving || !runtime.pendingResume) return;
	if (useResumeStore.getState().saveConflict) return;

	const submitted = runtime.pendingResume;
	const submittedData = cloneResumeData(submitted.data);
	runtime.pendingResume = undefined;
	runtime.isSaving = true;

	try {
		const updated = (await orpc.resume.update.call(
			{
				id: submitted.id,
				data: submittedData,
				// Optimistic concurrency: reject the write when the server moved past our base so a
				// concurrent tab/agent edit is merged instead of silently clobbered.
				...(runtime.baseUpdatedAt ? { expectedUpdatedAt: new Date(runtime.baseUpdatedAt) } : {}),
			},
			{ signal: runtime.abortController.signal },
		)) as Resume;
		if (runtimes.get(id) !== runtime || runtime.abortController.signal.aborted) return;

		runtime.queryClient?.setQueryData(getResumeQueryKey(submitted.id), updated);

		const currentResume = useResumeStore.getState().resume;
		const currentDataStillMatchesSubmission =
			currentResume?.id === submitted.id && isEqual(currentResume.data, submittedData);

		if (currentDataStillMatchesSubmission && !runtime.pendingResume) {
			runtime.hasPendingLocalChanges = false;
			// The local data still equals what we just saved, so the client already holds the canonical
			// data — only server-owned metadata (updatedAt, etc.) can differ. Merge just that instead of
			// replacing the whole resume: a full replace swaps every nested reference (the server strips
			// `undefined`s, so an equality check on its echo can't even confirm they match), which fires
			// every `data` selector and remounts the entire builder tree on each save-after-typing.
			useResumeStore.getState().mergeResumeMetadata(updated);
			useResumeStore.getState().setSaveStatus("saved");
		} else {
			runtime.hasPendingLocalChanges = true;
			useResumeStore.getState().mergeResumeMetadata(updated);

			if (!runtime.pendingResume && currentResume?.id === submitted.id && !isEqual(currentResume.data, submittedData)) {
				runtime.syncResume.cancel();
				runtime.pendingResume = cloneResume(currentResume);
			}
		}

		if (runtime.syncErrorToastId !== undefined) {
			toast.close(runtime.syncErrorToastId);
			runtime.syncErrorToastId = undefined;
		}

		// The server holds everything we tried to send; the crash-recovery copy is now redundant.
		markRuntimeSynced(id, updated);
		if (runtime.hasPendingLocalChanges) stashRecoverableDraft(id);
		else clearStashedDraft(id);
	} catch (error: unknown) {
		if (runtimes.get(id) !== runtime || runtime.abortController.signal.aborted) return;
		if (error instanceof DOMException && error.name === "AbortError") return;

		// Someone else saved while our edits were pending: replay our edits on top of theirs
		// instead of letting the stale full-document write erase them. Bounded retries keep a
		// pathological editor from looping forever.
		if (
			error instanceof ORPCError &&
			error.code === "RESUME_VERSION_CONFLICT" &&
			runtime.baseData &&
			(runtime.baseRetryCount ?? 0) < 2
		) {
			runtime.baseRetryCount = (runtime.baseRetryCount ?? 0) + 1;
			runtime.pendingResume ??= submitted;
			runtime.hasPendingLocalChanges = true;
			try {
				await recoverFromVersionConflict(id);
				return;
			} catch {
				// A failed conflict refetch follows the ordinary recoverable-save-error path.
			}
		}

		runtime.pendingResume ??= submitted;
		runtime.hasPendingLocalChanges = true;
		useResumeStore.getState().setSaveStatus("error");
		// 401/500/offline: mirror the pending edit into storage. The in-memory copy dies on the
		// auth redirect, a reload, or tab close — this is what makes the last edit recoverable.
		stashRecoverableDraft(id);
		runtime.syncErrorToastId = toast.add({
			type: "error",
			description:
				error instanceof ORPCError && error.code === "UNAUTHORIZED"
					? t`Your session expired. Sign in again to save your changes.`
					: t`Your latest changes could not be saved.`,
			actionProps:
				error instanceof ORPCError && error.code === "UNAUTHORIZED"
					? {
							children: t`Sign in again`,
							onClick: () => {
								// Re-save the latest edit, not just the state at the original failure.
								// If storage is unavailable, retain the in-memory draft on this page.
								if (!stashRecoverableDraft(id)) return;
								const callbackURL = `/builder/${encodeURIComponent(id)}`;
								window.location.assign(`/auth/login?callbackURL=${encodeURIComponent(callbackURL)}`);
							},
						}
					: undefined,
			id: runtime.syncErrorToastId,
			timeout: 0,
		});
	} finally {
		if (runtime.slowSaveToastId !== undefined) {
			toast.close(runtime.slowSaveToastId);
			runtime.slowSaveToastId = undefined;
		}
		runtime.isSaving = false;
		if (
			runtimes.get(id) === runtime &&
			!runtime.abortController.signal.aborted &&
			runtime.pendingResume &&
			runtime.syncErrorToastId === undefined &&
			!useResumeStore.getState().saveConflict
		)
			void flushResumeSave(id);
	}
}

/**
 * Conflict path: refetch the server version, replay the pending local edits on top of it, and
 * save the merged document with the fresh base. Informs the user that a merge happened.
 */
async function recoverFromVersionConflict(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime?.baseData) return;

	// The merge base is the version our edits started from — capture it before overwriting.
	const baseData = runtime.baseData;
	const server = (await orpc.resume.getById.call({ id })) as Resume;
	if (runtimes.get(id) !== runtime || runtime.abortController.signal.aborted) return;

	const local = useResumeStore.getState().resume;
	if (!local || local.id !== id) return;

	const merged = mergeResumeVersions(baseData, local.data, server.data);
	runtime.syncResume.cancel();
	if (merged.conflicts.length > 0) {
		useResumeStore.setState({ saveConflict: { baseData, server }, saveStatus: "error" });
		stashRecoverableDraft(id);
		return;
	}
	runtime.baseData = cloneResumeData(server.data);
	runtime.baseUpdatedAt = new Date(server.updatedAt).toISOString();
	useResumeStore.getState().patchResume((draft) => {
		draft.data = merged.data as WritableDraft<ResumeData>;
	});
	stashRecoverableDraft(id);
	notifyExternalUpdate("update");
	queueResumeSave(useResumeStore.getState().resume as Resume);
}

function queueResumeSave(resume: Resume) {
	const runtime = getRuntime(resume.id);
	runtime.pendingResume = cloneResume(resume);
	runtime.hasPendingLocalChanges = true;
	void flushResumeSave(resume.id);
}

function createRuntime(id: string): Runtime {
	const abortController = new AbortController();

	const syncResume = debounce(
		(resume: Resume) => {
			queueResumeSave(resume);
		},
		SAVE_DEBOUNCE_MS,
		{ signal: abortController.signal },
	);

	const runtime: Runtime = {
		abortController,
		hasPendingLocalChanges: false,
		isSaving: false,
		syncResume,
	};

	if (typeof window !== "undefined") {
		// Storage write must happen while the page is still alive: this handler races unload.
		runtime.beforeUnloadHandler = () => {
			stashRecoverableDraft(id);
			runtime.syncResume.flush();
		};
		window.addEventListener("beforeunload", runtime.beforeUnloadHandler);
	}

	return runtime;
}

function getRuntime(id: string): Runtime {
	const existing = runtimes.get(id);
	if (existing) return existing;

	const runtime = createRuntime(id);
	runtimes.set(id, runtime);
	return runtime;
}

function bindRuntimeQueryClient(id: string, queryClient: QueryClient) {
	getRuntime(id).queryClient = queryClient;
}

/** Binds the signed-in user so recovery drafts are scoped to this account. */
export function bindRuntimeUser(id: string, userId: string) {
	getRuntime(id).userId = userId;
}

export type { RecoverableDraft };

export function findRecoverableDraft(id: string, userId: string) {
	return loadRecoverableDraft(userId, id);
}

export function discardRecoverableDraft(id: string, userId: string, draftId?: string) {
	clearRecoverableDraft(userId, id, draftId);
}

/**
 * Applies a recovered draft and routes it through the normal autosave path. Explicit user
 * action — never called automatically — so overwriting the server version is a choice the
 * user made, not a silent rebase.
 */
export async function applyRecoveredDraft(id: string, draft: RecoverableDraft): Promise<boolean> {
	const current = useResumeStore.getState().resume;
	const runtime = runtimes.get(id);
	if (!current || current.id !== id || runtime?.userId !== draft.userId || draft.resumeId !== id) return false;
	let server: Resume;
	try {
		server = (await orpc.resume.getById.call({ id })) as Resume;
	} catch {
		toast.add({ type: "error", description: t`The saved version could not be loaded. Your draft is still available.` });
		return false;
	}
	if (runtimes.get(id) !== runtime || runtime.abortController.signal.aborted) return false;
	runtime.syncResume.cancel();
	runtime.recoveredDraft = draft;
	runtime.hasPendingLocalChanges = true;
	const result = draft.baseData ? mergeResumeVersions(draft.baseData, draft.data, server.data) : null;
	useResumeStore.getState().replaceResumeDraft({ ...server, data: draft.data });
	if (!result || result.conflicts.length > 0) {
		runtime.baseData = draft.baseData;
		runtime.baseUpdatedAt = draft.baseUpdatedAt ?? undefined;
		useResumeStore.setState({ saveConflict: { baseData: draft.baseData, server }, saveStatus: "error" });
		stashRecoverableDraft(id);
		return true;
	}
	useResumeStore.getState().replaceResumeDraft({ ...server, data: result.data });
	markRuntimeSynced(id, server);
	useResumeStore.getState().setSaveStatus("saving");
	stashRecoverableDraft(id);
	queueResumeSave(useResumeStore.getState().resume as Resume);
	return true;
}

/** User chooses only ambiguous values; independent changes on both sides are retained. */
export function resolveResumeConflict(preference: "local" | "server") {
	const { resume, saveConflict } = useResumeStore.getState();
	if (!resume || !saveConflict) return;
	const { baseData, server } = saveConflict;
	const data = baseData
		? mergeResumeVersions(baseData, resume.data, server.data, preference).data
		: preference === "local"
			? resume.data
			: server.data;
	useResumeStore.getState().replaceResumeDraft({ ...server, data });
	useResumeStore.setState({ saveConflict: null, saveStatus: "saving" });
	const runtime = getRuntime(resume.id);
	markRuntimeSynced(resume.id, server);
	runtime.syncResume.cancel();
	if (runtime.syncErrorToastId) toast.close(runtime.syncErrorToastId);
	runtime.syncErrorToastId = undefined;
	stashRecoverableDraft(resume.id);
	queueResumeSave(useResumeStore.getState().resume as Resume);
}

function hasPendingLocalChanges(id: string): boolean {
	return getRuntime(id).hasPendingLocalChanges;
}

function cleanupRuntime(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime) return;

	stashRecoverableDraft(id);
	runtime.syncResume.flush();
	runtime.abortController.abort();

	if (runtime.beforeUnloadHandler && typeof window !== "undefined") {
		window.removeEventListener("beforeunload", runtime.beforeUnloadHandler);
	}

	if (runtime.deferredFocusHandler && typeof document !== "undefined") {
		document.removeEventListener("focusout", runtime.deferredFocusHandler, true);
	}

	runtimes.delete(id);
}

function syncCurrentResume(id: string) {
	const resume = useResumeStore.getState().resume;
	if (!resume || resume.id !== id) return;

	stashRecoverableDraft(id);
	getRuntime(id).syncResume(resume);
}

export const useResumeStore = create<ResumeStore>()(
	immer((set, get) => ({
		resume: null,
		resumeId: undefined,
		isReady: false,
		saveStatus: "idle",
		saveConflict: null,
		undoStack: [],
		redoStack: [],
		canUndo: false,
		canRedo: false,

		initialize: (resume) => {
			if (resume) {
				setRuntimeBaseline(resume);
				markRuntimeSynced(resume.id, resume);
			}
			resetHistoryRuntime();

			set((state) => {
				state.resume = resume;
				state.resumeId = resume?.id;
				state.isReady = resume !== null;
				state.saveStatus = "idle";
				state.saveConflict = null;
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},

		reset: () => {
			const id = get().resume?.id;
			if (id) cleanupRuntime(id);
			resetHistoryRuntime();

			set((state) => {
				state.resume = null;
				state.resumeId = undefined;
				state.isReady = false;
				state.saveStatus = "idle";
				state.saveConflict = null;
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},

		replaceResumeDraft: (resume) => {
			resetHistoryRuntime();

			set((state) => {
				state.resume = resume;
				state.resumeId = resume.id;
				state.isReady = true;
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},

		replaceResumeFromServer: (resume) => {
			setRuntimeBaseline(resume);
			markRuntimeSynced(resume.id, resume);

			// This runs both for the echo of our own autosave (identical data → keep history) and for
			// external/cross-tab/AI rebases (different data → local undo history no longer applies).
			const current = get().resume;
			const isRebase = !current || !isEqual(current.data, resume.data);
			if (isRebase) resetHistoryRuntime();

			set((state) => {
				state.resume = resume;
				state.resumeId = resume.id;
				state.isReady = true;

				if (isRebase) {
					state.undoStack = [];
					state.redoStack = [];
					state.canUndo = false;
					state.canRedo = false;
				}
			});
		},

		patchResume: (fn) => {
			set((state) => {
				if (!state.resume) return;
				fn(state.resume as WritableDraft<Resume>);
			});
		},

		setSaveStatus: (status) => {
			set((state) => {
				state.saveStatus = status;
			});
		},

		mergeResumeMetadata: (resume) => {
			set((state) => {
				if (!state.resume || state.resume.id !== resume.id) return;

				state.resume.name = resume.name;
				state.resume.slug = resume.slug;
				state.resume.tags = resume.tags;
				state.resume.isLocked = resume.isLocked;
				state.resume.updatedAt = resume.updatedAt;
				state.resume.hasPassword = resume.hasPassword;
				state.resume.isPublic = resume.isPublic;
				state.resume.showDownloadButtons = resume.showDownloadButtons;
			});
		},

		updateResumeData: (fn) => {
			const currentResume = get().resume;
			if (!currentResume) return;

			if (currentResume.isLocked) {
				lockedToastId = toast.add({
					type: "error",
					description: t`This resume is locked and cannot be updated.`,
					id: lockedToastId,
				});
				return;
			}

			// Coalesce bursts: only the first edit of a burst opens a new undo step by snapshotting the
			// pre-edit state. Edits within HISTORY_COALESCE_MS of the previous one fold into that step.
			const now = Date.now();
			const coalesce = historyCanCoalesce && now - historyLastEditAt < HISTORY_COALESCE_MS;
			const snapshotBefore = coalesce ? undefined : cloneResumeData(currentResume.data);
			historyLastEditAt = now;
			historyCanCoalesce = true;

			set((state) => {
				if (!state.resume) return;

				if (snapshotBefore) {
					state.undoStack.push(snapshotBefore);
					if (state.undoStack.length > MAX_HISTORY_ENTRIES) state.undoStack.shift();
					// A fresh edit invalidates the redo branch.
					state.redoStack = [];
				}

				fn(state.resume.data as WritableDraft<ResumeData>);
				state.saveStatus = "saving";
				state.canUndo = state.undoStack.length > 0;
				state.canRedo = state.redoStack.length > 0;
			});

			getRuntime(currentResume.id).hasPendingLocalChanges = true;
			syncCurrentResume(currentResume.id);
		},

		undo: () => {
			applyHistoryStep(get, set, "undo");
		},

		redo: () => {
			applyHistoryStep(get, set, "redo");
		},
	})),
);

type ImmerSet = (fn: (state: WritableDraft<ResumeStore>) => void) => void;
type StoreGet = () => ResumeStore;

// Shared undo/redo: move the current data to the opposite stack and install the popped snapshot,
// then route the change through the normal autosave path so the preview and sync react as usual.
function applyHistoryStep(get: StoreGet, set: ImmerSet, direction: "undo" | "redo") {
	const state = get();
	const currentResume = state.resume;
	if (!currentResume) return;

	if (currentResume.isLocked) {
		lockedToastId = toast.add({
			type: "error",
			description: t`This resume is locked and cannot be updated.`,
			id: lockedToastId,
		});
		return;
	}

	const source = direction === "undo" ? state.undoStack : state.redoStack;
	if (source.length === 0) return;

	// The next edit after an undo/redo must start a brand-new undo step.
	resetHistoryRuntime();
	const current = cloneResumeData(currentResume.data);

	set((draft) => {
		if (!draft.resume) return;

		const from = direction === "undo" ? draft.undoStack : draft.redoStack;
		const to = direction === "undo" ? draft.redoStack : draft.undoStack;

		const snapshot = from.pop();
		if (snapshot === undefined) return;

		to.push(current as WritableDraft<ResumeData>);
		if (to.length > MAX_HISTORY_ENTRIES) to.shift();

		draft.resume.data = snapshot;
		draft.saveStatus = "saving";
		draft.canUndo = draft.undoStack.length > 0;
		draft.canRedo = draft.redoStack.length > 0;
	});

	getRuntime(currentResume.id).hasPendingLocalChanges = true;
	syncCurrentResume(currentResume.id);
}

// Mobile builder keeps the live preview mounted across tabs (to preserve zoom/pan), but pauses its PDF
// re-render while the Edit/Design overlay covers it — otherwise every keystroke re-renders a hidden PDF.
// Desktop never pauses. Lives here because it's the SSR-safe module both the shell and preview import.
type PreviewPausedStore = {
	paused: boolean;
	setPaused: (paused: boolean) => void;
};

export const usePreviewPausedStore = create<PreviewPausedStore>()((set) => ({
	paused: false,
	setPaused: (paused) => set({ paused }),
}));

export function usePatchResume() {
	return useResumeStore((state) => state.patchResume);
}

function useBuilderResumeSelector<T>(selector: (resume: Resume) => T): T | undefined {
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;

	return useResumeStore((state) => {
		if (!resumeId || !state.resume || state.resume.id !== resumeId) return undefined;
		return selector(state.resume);
	});
}

export function useCurrentBuilderResumeSelector<T>(selector: (resume: Resume) => T): T {
	const selected = useBuilderResumeSelector(selector);
	if (selected === undefined) throw new Error("Resume data is required before rendering this component.");
	return selected;
}

export function useResume(): Resume | undefined {
	return useBuilderResumeSelector((resume) => resume);
}

export function useCurrentResume(): Resume {
	const resume = useResume();
	if (!resume) throw new Error("Resume data is required before rendering this component.");
	return resume;
}

export function useResumeData(): ResumeData | undefined {
	return useBuilderResumeSelector((resume) => resume.data);
}

export function useIsResumeLocked(): boolean {
	return useBuilderResumeSelector((resume) => resume.isLocked) ?? false;
}

export function useUpdateResumeData() {
	const queryClient = useQueryClient();
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;
	const updateResumeData = useResumeStore((state) => state.updateResumeData);

	return useCallback(
		(fn: (draft: WritableDraft<ResumeData>) => void) => {
			if (!resumeId) return;
			bindRuntimeQueryClient(resumeId, queryClient);
			updateResumeData(fn);
		},
		[queryClient, resumeId, updateResumeData],
	);
}

export function useResumeUpdateSubscription({ resumeId, onUpdate, onError }: ResumeUpdateSubscriptionOptions) {
	const [_retryNonce, setRetryNonce] = useState(0);

	useEffect(() => {
		if (!resumeId) return;

		let didCancel = false;
		let retryTimer: number | undefined;
		const cancel = consumeEventIterator(streamClient.resume.updates.subscribe({ id: resumeId }), {
			onEvent: async (event) => {
				try {
					await onUpdate((event ?? { mutation: "sync" }) as ResumeUpdateEvent);
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") return;
					onError?.(error);
				}
			},
			onError: (error) => {
				if (didCancel) return;
				onError?.(error);
				retryTimer = window.setTimeout(() => setRetryNonce((value) => value + 1), 2500);
			},
		});

		return () => {
			didCancel = true;
			if (retryTimer) window.clearTimeout(retryTimer);
			void cancel().catch(() => {});
		};
	}, [onError, onUpdate, resumeId]);
}

export function useBuilderResumeUpdateSubscription() {
	const queryClient = useQueryClient();
	const replaceResumeFromServer = useResumeStore((state) => state.replaceResumeFromServer);
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;

	const onUpdate = useCallback(
		async (event: ResumeUpdateEvent) => {
			if (!resumeId) return;

			bindRuntimeQueryClient(resumeId, queryClient);
			const resume = (await orpc.resume.getById.call({ id: resumeId })) as Resume;

			queryClient.setQueryData(getResumeQueryKey(resumeId), resume);

			if (hasPendingLocalChanges(resumeId)) {
				useResumeStore.getState().mergeResumeMetadata(resume);
				return;
			}

			const current = useResumeStore.getState().resume;
			const isExternalChange =
				event.mutation !== "sync" && current?.id === resume.id && !isEqual(current.data, resume.data);

			if (!isExternalChange) {
				replaceResumeFromServer(resume);
				return;
			}

			// #54: never overwrite a field the user is editing; defer the swap until blur.
			if (isEditableElementFocused()) {
				useResumeStore.getState().mergeResumeMetadata(resume);
				deferRemoteResumeUntilBlur(resumeId, resume);
				return;
			}

			// #53: attribute cross-tab / AI-agent edits instead of silently swapping the document.
			replaceResumeFromServer(resume);
			notifyExternalUpdate(event.mutation);
		},
		[queryClient, replaceResumeFromServer, resumeId],
	);

	const onError = useCallback((error: unknown) => {
		console.warn("Resume update stream failed, reconnecting:", error);
	}, []);

	useResumeUpdateSubscription({ resumeId, onUpdate, onError });
}

// Route transitions can await a save; unmount cleanup and browser unload cannot.
function saveResumeBeforeLeaving(id: string): boolean | Promise<boolean> {
	const runtime = runtimes.get(id);
	const current = useResumeStore.getState().resume;
	if (!runtime?.hasPendingLocalChanges || current?.id !== id) return true;
	if (useResumeStore.getState().saveConflict) {
		stashRecoverableDraft(id);
		return false;
	}

	runtime.syncResume.cancel();
	runtime.pendingResume = cloneResume(current);
	useResumeStore.getState().setSaveStatus("saving");

	return new Promise<boolean>((resolve) => {
		const finish = (saved: boolean) => {
			clearTimeout(timeout);
			unsubscribe();
			// A save we could not confirm must survive the coming route change / reload.
			if (!saved) stashRecoverableDraft(id);
			resolve(saved);
		};
		const unsubscribe = useResumeStore.subscribe((state) => {
			if (state.resume?.id !== id || state.saveStatus === "error") {
				finish(false);
			} else if (state.saveStatus === "saved" && !runtime.hasPendingLocalChanges) {
				finish(true);
			}
		});
		const timeout = setTimeout(() => {
			finish(false);
			// Keep the write in flight: it may already have reached the server.
			runtime.slowSaveToastId = toast.add({
				type: "info",
				description: t`Saving is taking longer than expected. Your changes are still open.`,
				id: runtime.slowSaveToastId,
				timeout: 0,
			});
		}, NAVIGATION_SAVE_WAIT_MS);
		void flushResumeSave(id);
	});
}

export function useResumeCleanup() {
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;
	const reset = useResumeStore((state) => state.reset);

	useBlocker({
		shouldBlockFn: async ({ next }) => {
			if (!resumeId || ("resumeId" in next.params && next.params.resumeId === resumeId)) return false;
			return !(await saveResumeBeforeLeaving(resumeId));
		},
		enableBeforeUnload: () => !!resumeId && (runtimes.get(resumeId)?.hasPendingLocalChanges ?? false),
	});

	useEffect(() => {
		if (!resumeId) return;

		return () => {
			cleanupRuntime(resumeId);
			reset();
		};
	}, [resumeId, reset]);
}
