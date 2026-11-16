// @vitest-environment happy-dom
import type { GuestRecord } from "./storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

const storage = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn() }));
vi.mock("./storage", async (original) => ({
	...(await original<typeof import("./storage")>()),
	readGuestRaw: storage.read,
	openGuestRecord: storage.open,
}));
const options = () => ({ enabled: true, origin: window.location.origin, locale: "zh-CN" });
function record(): GuestRecord {
	return {
		version: 1,
		draftId: crypto.randomUUID(),
		epoch: crypto.randomUUID(),
		revision: 12,
		savedAt: Date.now() - 8 * 86400000,
		writers: [],
		snapshot: {
			format: "weekly-resume-local-backup",
			version: 1,
			name: "原创虚构入口样本",
			data: structuredClone(defaultResumeData),
			photo: null,
		},
	};
}
beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	storage.read.mockResolvedValue(undefined);
	storage.open.mockImplementation(async (candidate: GuestRecord) => candidate);
});
describe("mounted guest entry bootstrap", () => {
	it("importing the entry helper for preloading performs no storage IO", async () => {
		await import("./entry-state");
		expect(storage.read).not.toHaveBeenCalled();
		expect(storage.open).not.toHaveBeenCalled();
	});
	it("shares initialization during repeated mounts/clicks, then re-reads the existing winner", async () => {
		const { prepareGuestEntry } = await import("./entry-state");
		let stored: GuestRecord | undefined;
		storage.read.mockImplementation(async () => stored);
		storage.open.mockImplementation(async (candidate: GuestRecord) => {
			await Promise.resolve();
			stored ??= candidate;
			return stored;
		});
		const [a, b] = await Promise.all([prepareGuestEntry(options()), prepareGuestEntry(options())]);
		expect(a).toEqual(b);
		expect(a.kind).toBe("ready");
		expect(storage.open).toHaveBeenCalledTimes(1);
		expect(await prepareGuestEntry(options())).toEqual(a);
		expect(storage.open).toHaveBeenCalledTimes(1);
	});
	it("navigates to the other tab's transaction winner, not the losing candidate ID", async () => {
		const winner = record();
		storage.open.mockResolvedValue(winner);
		const { prepareGuestEntry } = await import("./entry-state");
		expect(await prepareGuestEntry(options())).toEqual({ kind: "ready", record: winner });
	});
	it("preserves complete existing content and resumes even with creation disabled", async () => {
		const old = record();
		old.snapshot.data.metadata.notes = "虚构私人备注";
		old.snapshot.data.summary.content = "<p>虚构正文</p>";
		old.snapshot.photo = { mime: "image/png", base64: "b3JpZ2luYWw=" };
		old.snapshot.data.summary.hidden = true;
		storage.read.mockResolvedValue(old);
		const { prepareGuestEntry } = await import("./entry-state");
		expect(await prepareGuestEntry({ ...options(), enabled: false })).toEqual({ kind: "ready", record: old });
		expect(storage.open).not.toHaveBeenCalled();
	});
	it.each([false, 0, { version: 99, original: "原创虚构未知结构" }])(
		"unknown format %j remains retrievable, never becomes an empty draft",
		async (raw) => {
			storage.read.mockResolvedValue(raw);
			const { prepareGuestEntry } = await import("./entry-state");
			expect(await prepareGuestEntry(options())).toEqual({ kind: "unknown", raw });
			expect(storage.open).not.toHaveBeenCalled();
		},
	);
	it("read failure stops initialization instead of treating the draft as absent", async () => {
		storage.read.mockRejectedValue(new Error("read failure"));
		const { prepareGuestEntry } = await import("./entry-state");
		expect((await prepareGuestEntry(options())).kind).toBe("unavailable");
		expect(storage.open).not.toHaveBeenCalled();
	});
	it("does not write before a slow restore finishes", async () => {
		let finish!: (value: GuestRecord) => void;
		storage.read.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const { prepareGuestEntry } = await import("./entry-state");
		const pending = prepareGuestEntry(options());
		expect(storage.open).not.toHaveBeenCalled();
		const old = record();
		finish(old);
		expect(await pending).toEqual({ kind: "ready", record: old });
		expect(storage.open).not.toHaveBeenCalled();
	});
	it("write failure keeps the exact memory candidate for retry and backup", async () => {
		storage.open.mockRejectedValue(new Error("quota"));
		const { prepareGuestEntry, getMemoryGuestCandidate } = await import("./entry-state");
		const result = await prepareGuestEntry(options());
		expect(result.kind).toBe("unavailable");
		if (result.kind !== "unavailable") throw new Error("wrong state");
		expect(result.candidate).toBe(getMemoryGuestCandidate());
		expect(result.candidate?.snapshot.data).toBeDefined();
		expect(await prepareGuestEntry(options())).toEqual(result);
		expect(storage.open).toHaveBeenCalledTimes(1);
	});
	it("disabled empty entry and mismatched origin create nothing", async () => {
		const { prepareGuestEntry } = await import("./entry-state");
		expect(await prepareGuestEntry({ ...options(), enabled: false })).toEqual({ kind: "disabled" });
		expect(await prepareGuestEntry({ ...options(), origin: "https://fictional.invalid" })).toEqual({ kind: "origin" });
		expect(storage.open).not.toHaveBeenCalled();
	});
});
