// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import {
	clearRecoverableDraft,
	loadRecoverableDraft,
	loadRecoverableDrafts,
	saveRecoverableDraft,
} from "./draft-recovery";

const data = (): ResumeData => structuredClone(defaultResumeData);
const present = <T>(value: T | null): T => {
	if (value === null) throw new Error("Missing test fixture");
	return value;
};

beforeEach(() => {
	localStorage.clear();
});

describe("recoverable draft storage", () => {
	it("keeps independent snapshots and clears only the selected revision", () => {
		const one = present(saveRecoverableDraft({ userId: "u", resumeId: "r", baseUpdatedAt: null, data: data() }));
		const two = present(saveRecoverableDraft({ userId: "u", resumeId: "r", baseUpdatedAt: null, data: data() }));
		expect(one.draftId).not.toBe(two.draftId);
		clearRecoverableDraft("u", "r", one.draftId);
		expect(loadRecoverableDrafts("u", "r").map((draft) => draft.draftId)).toEqual([two.draftId]);
	});
	it("returns a backup failure when storage access is denied", () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new Error("Denied");
			},
		});
		try {
			expect(saveRecoverableDraft({ userId: "u", resumeId: "r", baseUpdatedAt: null, data: data() })).toBeNull();
			expect(loadRecoverableDrafts("u", "r")).toEqual([]);
			expect(() => clearRecoverableDraft("u", "r")).not.toThrow();
		} finally {
			if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
		}
	});
	it("preserves the last backup if a later write exceeds quota", () => {
		const first = saveRecoverableDraft({ userId: "u", resumeId: "r", baseUpdatedAt: null, data: data() });
		const mock = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("Quota");
		});
		try {
			expect(saveRecoverableDraft({ userId: "u", resumeId: "r", baseUpdatedAt: null, data: data() })).toBeNull();
			expect(loadRecoverableDraft("u", "r")?.draftId).toBe(first?.draftId);
		} finally {
			mock.mockRestore();
		}
	});
	it("round-trips a draft for the same user and resume", () => {
		saveRecoverableDraft({
			userId: "user-1",
			resumeId: "resume-1",
			baseUpdatedAt: "2026-09-26T00:00:00Z",
			data: data(),
		});

		const draft = loadRecoverableDraft("user-1", "resume-1");
		expect(draft).not.toBeNull();
		expect(draft?.userId).toBe("user-1");
		expect(draft?.resumeId).toBe("resume-1");
		expect(draft?.baseUpdatedAt).toBe("2026-09-26T00:00:00.000Z");
		expect(draft?.data.basics.name).toBe(defaultResumeData.basics.name);
	});

	it("never returns a draft to a different user or resume", () => {
		saveRecoverableDraft({ userId: "user-1", resumeId: "resume-1", baseUpdatedAt: null, data: data() });

		expect(loadRecoverableDraft("user-2", "resume-1")).toBeNull();
		expect(loadRecoverableDraft("user-1", "resume-2")).toBeNull();
	});

	it("drops entries past the TTL instead of offering stale content", () => {
		saveRecoverableDraft({ userId: "user-1", resumeId: "resume-1", baseUpdatedAt: null, data: data() });

		const key = present(localStorage.key(0));
		const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as { savedAt: string };
		raw.savedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
		localStorage.setItem(key, JSON.stringify(raw));

		expect(loadRecoverableDraft("user-1", "resume-1")).toBeNull();
		expect(localStorage.getItem(key)).toBeNull();
	});

	it("discards corrupt JSON instead of throwing", () => {
		localStorage.setItem("weekly-resume:unsaved-draft:user-1:resume-1", "{not json");

		expect(loadRecoverableDraft("user-1", "resume-1")).toBeNull();
		expect(localStorage.getItem("weekly-resume:unsaved-draft:user-1:resume-1")).toBeNull();
	});

	it("rejects an entry whose stored identity does not match its key", () => {
		saveRecoverableDraft({ userId: "user-1", resumeId: "resume-1", baseUpdatedAt: null, data: data() });

		const key = present(localStorage.key(0));
		const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as { resumeId: string };
		raw.resumeId = "resume-2";
		localStorage.setItem(key, JSON.stringify(raw));

		expect(loadRecoverableDraft("user-1", "resume-1")).toBeNull();
	});

	it("clears on demand and stays silent when storage is empty", () => {
		expect(clearRecoverableDraft("user-1", "resume-1")).toBeUndefined();

		saveRecoverableDraft({ userId: "user-1", resumeId: "resume-1", baseUpdatedAt: null, data: data() });
		clearRecoverableDraft("user-1", "resume-1", loadRecoverableDraft("user-1", "resume-1")?.draftId);

		expect(loadRecoverableDraft("user-1", "resume-1")).toBeNull();
	});
});
