import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { GuestRecord } from "./storage";
import { applyChineseBlankResume } from "@reactive-resume/schema/resume/blank-zh-cn";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { captureGuestSnapshot } from "./snapshot";
import { guestRecordSchema, openGuestRecord, readGuestRaw } from "./storage";

type EntryOptions = { enabled: boolean; origin: string; locale: string };
export type GuestEntryResult =
	| { kind: "ready"; record: GuestRecord }
	| { kind: "unknown"; raw: unknown }
	| { kind: "unavailable"; candidate?: GuestRecord }
	| { kind: "disabled" | "origin" };

let opening: Promise<GuestEntryResult> | undefined;
let memoryCandidate: GuestRecord | undefined;
export const getMemoryGuestCandidate = () => memoryCandidate;

async function createCandidate(locale: string, restored?: { data: ResumeData; name: string }): Promise<GuestRecord> {
	return {
		version: 1,
		draftId: crypto.randomUUID(),
		epoch: crypto.randomUUID(),
		revision: 0,
		savedAt: Date.now(),
		writers: [],
		snapshot: await captureGuestSnapshot(
			restored?.name ?? (locale.startsWith("zh") ? "我的简历" : "My resume"),
			restored?.data ?? applyChineseBlankResume(structuredClone(defaultResumeData), locale),
		),
	};
}

async function prepare(
	options: EntryOptions,
	restored?: { data: ResumeData; name: string },
): Promise<GuestEntryResult> {
	let raw: unknown;
	try {
		raw = await readGuestRaw();
	} catch {
		// A failed read never proves the browser has no draft.
		return { kind: "unavailable", candidate: memoryCandidate };
	}
	if (raw != null) {
		const existing = guestRecordSchema.safeParse(raw);
		return existing.success ? { kind: "ready", record: existing.data } : { kind: "unknown", raw };
	}
	if (memoryCandidate) return { kind: "unavailable", candidate: memoryCandidate };
	if (!options.enabled && !restored) return { kind: "disabled" };
	if (window.location.origin !== options.origin) return { kind: "origin" };
	const candidate = await createCandidate(options.locale, restored);
	try {
		// The IDB transaction chooses the winner if another tab created a draft meanwhile.
		const record = await openGuestRecord(candidate, "");
		if (!record) throw new Error("DRAFT_NOT_CREATED");
		return { kind: "ready", record };
	} catch {
		memoryCandidate = candidate;
		return { kind: "unavailable", candidate };
	}
}

/** Called only by the mounted entry component, never by a route loader/preload. */
export function prepareGuestEntry(options: EntryOptions, restored?: { data: ResumeData; name: string }) {
	if (!opening) {
		opening = prepare(options, restored).finally(() => {
			opening = undefined;
		});
	}
	return opening;
}
