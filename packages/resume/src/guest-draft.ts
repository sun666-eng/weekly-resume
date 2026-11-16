import z from "zod";
import { writableResumeDataSchema } from "@reactive-resume/schema/resume/write";

export const GUEST_OPERATION_TTL = 30 * 60 * 1000;
export const GUEST_REMINDER_AGE = 7 * 24 * 60 * 60 * 1000;
export const GUEST_JSON_LIMIT = 2 * 1024 * 1024;
export const GUEST_PHOTO_LIMIT = 10 * 1024 * 1024;
export const guestPhotoSchema = z
	.object({
		mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
		base64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
	})
	.strict();
export const guestSnapshotSchema = z
	.object({
		format: z.literal("weekly-resume-local-backup"),
		version: z.literal(1),
		name: z.string().trim().min(1).max(255),
		data: writableResumeDataSchema,
		photo: guestPhotoSchema.nullable(),
	})
	.strict()
	.refine((value) => value.data.picture.url === "", "Portable photos must use embedded bytes, not URLs");
export type GuestSnapshot = z.infer<typeof guestSnapshotSchema>;
export const guestActionSchema = z.enum(["save", "pdf", "docx", "markdown", "json", "print"]);
export type GuestAction = z.infer<typeof guestActionSchema>;
export const guestOperationSchema = z
	.object({
		id: z.uuid(),
		draftId: z.uuid(),
		claimId: z.uuid().optional(),
		epoch: z.uuid(),
		revision: z.number().int().nonnegative(),
		fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		snapshot: guestSnapshotSchema,
		action: guestActionSchema,
		createdAt: z.number().finite(),
		state: z.enum(["auth", "confirm", "claiming", "claimed", "attempted", "cancelled"]),
		accountId: z.string().optional(),
		resumeId: z.string().optional(),
	})
	.strict();
export type GuestOperation = z.infer<typeof guestOperationSchema>;

/** Object property order is irrelevant; array order and all text remain significant. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.filter((key) => Reflect.get(value, key) !== undefined)
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`)
		.join(",")}}`;
}

export async function fingerprintGuestSnapshot(input: GuestSnapshot): Promise<string> {
	const snapshot = guestSnapshotSchema.parse(input);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(snapshot)));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isGuestOperationActive(operation: GuestOperation, now = Date.now()): boolean {
	return (
		operation.state !== "cancelled" && operation.createdAt <= now && now - operation.createdAt < GUEST_OPERATION_TTL
	);
}

export function restoreGuestSnapshot(input: unknown) {
	const snapshot = guestSnapshotSchema.parse(input);
	const data = structuredClone(snapshot.data);
	data.picture.url = snapshot.photo ? `data:${snapshot.photo.mime};base64,${snapshot.photo.base64}` : "";
	return { name: snapshot.name, data };
}
