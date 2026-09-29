import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { writableResumeDataSchema } from "@reactive-resume/schema/resume/write";

const KEY_PREFIX = "weekly-resume:unsaved-draft:";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFT_JSON_BYTES = 2 * 1024 * 1024;

export type RecoverableDraft = {
	version?: 2;
	/** Immutable snapshot ID. Missing only on the old single-key format. */
	draftId?: string;
	resumeId: string;
	userId: string;
	savedAt: string;
	baseUpdatedAt: string | null;
	baseData?: ResumeData;
	data: ResumeData;
};

const prefix = (userId: string, resumeId: string) => `${KEY_PREFIX}${userId}:${resumeId}`;
const storageKey = (userId: string, resumeId: string, draftId?: string) =>
	`${prefix(userId, resumeId)}${draftId ? `:${draftId}` : ""}`;
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/** Each write has its own immutable key. Another tab cannot overwrite or clear a newer revision. */
export function saveRecoverableDraft(input: {
	userId: string;
	resumeId: string;
	baseUpdatedAt: Date | string | null;
	baseData?: ResumeData;
	data: ResumeData;
}): RecoverableDraft | null {
	try {
		if (typeof localStorage === "undefined") return null;
		const draft: RecoverableDraft = {
			version: 2,
			draftId: crypto.randomUUID(),
			userId: input.userId,
			resumeId: input.resumeId,
			savedAt: new Date().toISOString(),
			baseUpdatedAt: input.baseUpdatedAt ? new Date(input.baseUpdatedAt).toISOString() : null,
			...(input.baseData ? { baseData: input.baseData } : {}),
			data: input.data,
		};
		const json = JSON.stringify(draft);
		if (new TextEncoder().encode(json).byteLength > MAX_DRAFT_JSON_BYTES) return null;
		localStorage.setItem(storageKey(input.userId, input.resumeId, draft.draftId), json);
		return draft;
	} catch {
		return null;
	}
}

/** Validate shape, format version, dates and size before offering persisted data to the editor. */
export function loadRecoverableDrafts(userId: string, resumeId: string): RecoverableDraft[] {
	try {
		if (typeof localStorage === "undefined") return [];
		const start = prefix(userId, resumeId);
		const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
			(key): key is string => key !== null && (key === start || key.startsWith(`${start}:`)),
		);
		const drafts: RecoverableDraft[] = [];
		for (const key of keys) {
			const raw = localStorage.getItem(key);
			if (!raw) continue;
			try {
				if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_JSON_BYTES) throw new Error("oversize");
				const value: unknown = JSON.parse(raw);
				if (!value || typeof value !== "object") throw new Error("invalid");
				const draft = value as RecoverableDraft;
				if (
					draft.userId !== userId ||
					draft.resumeId !== resumeId ||
					(draft.version !== undefined && draft.version !== 2) ||
					(draft.version === 2 && (typeof draft.draftId !== "string" || !/^[\w-]+$/.test(draft.draftId))) ||
					key !== storageKey(userId, resumeId, draft.draftId) ||
					!validDate(draft.savedAt) ||
					(draft.baseUpdatedAt !== null && !validDate(draft.baseUpdatedAt)) ||
					Date.now() - Date.parse(draft.savedAt) > DRAFT_TTL_MS ||
					Date.parse(draft.savedAt) > Date.now() + 300_000
				)
					throw new Error("invalid");
				const data = writableResumeDataSchema.parse(draft.data);
				const baseData = draft.baseData === undefined ? undefined : writableResumeDataSchema.parse(draft.baseData);
				drafts.push({ ...draft, data, ...(baseData ? { baseData } : {}) });
			} catch {
				localStorage.removeItem(key);
			}
		}
		return drafts.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
	} catch {
		return [];
	}
}

export function loadRecoverableDraft(userId: string, resumeId: string): RecoverableDraft | null {
	return loadRecoverableDrafts(userId, resumeId)[0] ?? null;
}

/** Clear only the chosen immutable snapshot, never all backups belonging to this resume. */
export function clearRecoverableDraft(userId: string, resumeId: string, draftId?: string): void {
	try {
		if (typeof localStorage !== "undefined") localStorage.removeItem(storageKey(userId, resumeId, draftId));
	} catch {
		// The valid snapshot remains available until its TTL expires.
	}
}
