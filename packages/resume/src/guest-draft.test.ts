import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import {
	canonicalJson,
	fingerprintGuestSnapshot,
	GUEST_OPERATION_TTL,
	guestOperationSchema,
	guestSnapshotSchema,
	isGuestOperationActive,
	restoreGuestSnapshot,
} from "./guest-draft";

const sample = () =>
	guestSnapshotSchema.parse({
		format: "weekly-resume-local-backup",
		version: 1,
		name: "虚构草稿",
		data: structuredClone(defaultResumeData),
		photo: null,
	});
describe("portable guest snapshots", () => {
	it("round-trips hidden content, notes, layout and actual photo bytes without runtime state", () => {
		const snapshot = sample();
		snapshot.data.basics.name = "林知禾";
		snapshot.data.metadata.notes = "<p>虚构私人备注</p>";
		snapshot.photo = { mime: "image/png", base64: "AQIDBA==" };
		snapshot.data.picture.hidden = true;
		const restored = restoreGuestSnapshot(JSON.parse(JSON.stringify(snapshot)));
		expect(restored.data).toEqual({
			...snapshot.data,
			picture: { ...snapshot.data.picture, url: "data:image/png;base64,AQIDBA==" },
		});
		expect(guestSnapshotSchema.safeParse({ ...snapshot, token: "must-not-export" }).success).toBe(false);
	});
	it("rejects unknown versions and ephemeral/external photo addresses", () => {
		const snapshot = sample();
		expect(guestSnapshotSchema.safeParse({ ...snapshot, version: 2 }).success).toBe(false);
		snapshot.data.picture.url = "blob:expired";
		expect(guestSnapshotSchema.safeParse(snapshot).success).toBe(false);
	});
	it("ignores object key order but preserves semantic array order", async () => {
		const snapshot = sample();
		const reordered = Object.fromEntries(Object.entries(snapshot).reverse());
		expect(await fingerprintGuestSnapshot(snapshot)).toEqual(
			await fingerprintGuestSnapshot(guestSnapshotSchema.parse(reordered)),
		);
		expect(canonicalJson({ items: ["education", "experience"] })).not.toBe(
			canonicalJson({ items: ["experience", "education"] }),
		);
	});
	it("changes identity for private notes, content and photo bytes", async () => {
		const original = sample();
		const digest = await fingerprintGuestSnapshot(original);
		const changed = sample();
		changed.data.metadata.notes = "private change";
		expect(await fingerprintGuestSnapshot(changed)).not.toBe(digest);
		original.photo = { mime: "image/png", base64: "AQID" };
		changed.photo = { mime: "image/png", base64: "AQIE" };
		changed.data.metadata.notes = "";
		expect(await fingerprintGuestSnapshot(changed)).not.toBe(await fingerprintGuestSnapshot(original));
	});
});
describe("bounded operation lifetime", () => {
	it("does not revive cancelled, expired or future operations", async () => {
		const snapshot = sample();
		const op = guestOperationSchema.parse({
			id: crypto.randomUUID(),
			draftId: crypto.randomUUID(),
			epoch: crypto.randomUUID(),
			revision: 12,
			snapshot,
			fingerprint: await fingerprintGuestSnapshot(snapshot),
			action: "pdf",
			createdAt: 1000,
			state: "auth",
		});
		expect(isGuestOperationActive(op, 1001)).toBe(true);
		expect(isGuestOperationActive(op, 1000 + GUEST_OPERATION_TTL)).toBe(false);
		expect(isGuestOperationActive({ ...op, state: "cancelled" }, 1001)).toBe(false);
		expect(isGuestOperationActive(op, 999)).toBe(false);
		expect(guestOperationSchema.safeParse({ ...op, action: "publish" }).success).toBe(false);
		expect(guestOperationSchema.safeParse({ ...op, action: "cover-letter" }).success).toBe(false);
	});
});
