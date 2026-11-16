import { ORPCError } from "@orpc/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import sharp from "sharp";
import z from "zod";
import { db } from "@reactive-resume/db/client";
import { guestDraftClaim, guestPhotoAttempt, resume, resumeVersion } from "@reactive-resume/db/schema";
import {
	fingerprintGuestSnapshot,
	GUEST_JSON_LIMIT,
	GUEST_PHOTO_LIMIT,
	guestSnapshotSchema,
} from "@reactive-resume/resume/guest-draft";
import { generateId } from "@reactive-resume/utils/string";
import { protectedProcedure, resolveUserFromRequestHeaders } from "../../context";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { getStorageService, processImageForUpload } from "../storage/service";
import { hasResumeAccess } from "./access";
import { resumeService } from "./service";

export const claimGuestInput = z
	.object({
		draftId: z.uuid(),
		revision: z.number().int().nonnegative().max(2147483647),
		fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		expectedAccountId: z.string().min(1),
		snapshot: guestSnapshotSchema,
	})
	.strict();
type ClaimInput = z.infer<typeof claimGuestInput>;

export async function claimGuestDraft(userId: string, input: ClaimInput) {
	if (input.expectedAccountId !== userId) throw new ORPCError("CONFLICT", { message: "ACCOUNT_CHANGED" });
	const snapshot = guestSnapshotSchema.parse(input.snapshot);
	if (Buffer.byteLength(JSON.stringify({ ...snapshot, photo: null })) > GUEST_JSON_LIMIT) {
		throw new ORPCError("PAYLOAD_TOO_LARGE");
	}
	if (snapshot.photo && snapshot.photo.base64.length > Math.ceil(GUEST_PHOTO_LIMIT / 3) * 4) {
		throw new ORPCError("PAYLOAD_TOO_LARGE");
	}
	const fingerprint = await fingerprintGuestSnapshot(snapshot);
	if (fingerprint !== input.fingerprint) throw new ORPCError("BAD_REQUEST", { message: "SNAPSHOT_MISMATCH" });
	const data = structuredClone(snapshot.data);
	let attemptId: string | undefined;
	if (snapshot.photo) {
		const bytes = Buffer.from(snapshot.photo.base64, "base64");
		if (bytes.length > GUEST_PHOTO_LIMIT || bytes.length === 0) throw new ORPCError("BAD_REQUEST");
		// Decode even when optional compression is disabled. Never fetch client-supplied URLs.
		const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 })
			.metadata()
			.catch(() => null);
		if (!metadata || `image/${metadata.format}` !== snapshot.photo.mime) throw new ORPCError("BAD_REQUEST");
		// Reading metadata only parses the header. Decode pixels even if compression is disabled.
		await sharp(bytes, { limitInputPixels: 40_000_000 })
			.resize(1, 1)
			.png()
			.toBuffer()
			.catch(() => {
				throw new ORPCError("BAD_REQUEST");
			});
		const processed = await processImageForUpload(new File([bytes], "photo", { type: snapshot.photo.mime }));
		attemptId = generateId();
		const photoAttemptId = attemptId;
		const extension = processed.contentType === "image/png" ? "png" : processed.contentType.split("/")[1];
		const key = `uploads/${userId}/guest/${attemptId}.${extension}`;
		await db.insert(guestPhotoAttempt).values({
			id: attemptId,
			userId,
			key,
			leaseUntil: new Date(Date.now() + 10 * 60_000),
			expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
		});
		// This namespace is denied by the public proxy; only readGuestPhoto may serve it.
		await db.transaction(async (tx) => {
			const [attempt] = await tx
				.select()
				.from(guestPhotoAttempt)
				.where(eq(guestPhotoAttempt.id, photoAttemptId))
				.for("update");
			if (attempt?.state !== "preparing" || attempt.leaseUntil.getTime() <= Date.now()) throw new ORPCError("CONFLICT");
			// Hold this request's ledger lock while writing: reclamation cannot pass an in-flight writer.
			await getStorageService().write({ key, data: processed.data, contentType: processed.contentType });
		});
	}
	const result = await db.transaction(async (tx) => {
		// Concurrent first INSERTs wait on the unique key. The entire claim is committed atomically.
		const inserted = await tx
			.insert(guestDraftClaim)
			.values({ userId, draftId: input.draftId, revision: input.revision, fingerprint })
			.onConflictDoNothing()
			.returning();
		const [claim] = await tx
			.select()
			.from(guestDraftClaim)
			.where(and(eq(guestDraftClaim.userId, userId), eq(guestDraftClaim.draftId, input.draftId)))
			.for("update");
		if (!claim || claim.revision !== input.revision || claim.fingerprint !== fingerprint) {
			throw new ORPCError("CONFLICT", { message: "GUEST_SNAPSHOT_CONFLICT" });
		}
		if (!inserted.length) {
			if (!claim.resumeId) throw new ORPCError("GONE", { message: "CLAIMED_RESUME_DELETED" });
			return claim.resumeId;
		}
		const id = generateId();
		if (attemptId) {
			const [attempt] = await tx
				.select()
				.from(guestPhotoAttempt)
				.where(and(eq(guestPhotoAttempt.id, attemptId), eq(guestPhotoAttempt.userId, userId)))
				.for("update");
			if (attempt?.state !== "preparing" || attempt.leaseUntil.getTime() <= Date.now()) {
				throw new ORPCError("CONFLICT", { message: "PHOTO_ATTEMPT_EXPIRED" });
			}
			data.picture.url = `/api/resume-photo/${id}/${attemptId}`;
		}
		await tx.insert(resume).values({ id, userId, name: snapshot.name, slug: `resume-${id}`, data, isPublic: false });
		await tx
			.insert(resumeVersion)
			.values({ id: generateId(), userId, resumeId: id, data, label: "Guest draft claimed" });
		await tx
			.update(guestDraftClaim)
			.set({ resumeId: id })
			.where(and(eq(guestDraftClaim.userId, userId), eq(guestDraftClaim.draftId, input.draftId)));
		if (attemptId)
			await tx
				.update(guestPhotoAttempt)
				.set({ state: "referenced", resumeId: id })
				.where(eq(guestPhotoAttempt.id, attemptId));
		return id;
	});
	const saved = await resumeService.getById({ id: result, userId });
	const [originalPhoto] = await db
		.select()
		.from(guestPhotoAttempt)
		.where(
			and(
				eq(guestPhotoAttempt.resumeId, result),
				eq(guestPhotoAttempt.userId, userId),
				eq(guestPhotoAttempt.state, "referenced"),
			),
		)
		.limit(1);
	const originalUrl = originalPhoto ? `/api/resume-photo/${result}/${originalPhoto.id}` : "";
	const currentSnapshot = { ...snapshot, name: saved.name, data: structuredClone(saved.data) };
	currentSnapshot.data.picture.url = "";
	const matchesClaimedSnapshot =
		saved.data.picture.url === originalUrl && (await fingerprintGuestSnapshot(currentSnapshot)) === fingerprint;
	return {
		accountId: userId,
		draftId: input.draftId,
		revision: input.revision,
		fingerprint,
		matchesClaimedSnapshot,
		resume: saved,
	};
}

export const guestClaimRouter = {
	claimGuestDraft: protectedProcedure
		.input(claimGuestInput)
		.use(resumeMutationRateLimit)
		.handler(({ context, input }) => claimGuestDraft(context.user.id, input)),
	getGuestClaim: protectedProcedure
		.input(z.object({ draftId: z.uuid() }).strict())
		.handler(async ({ context, input }) => {
			const [claim] = await db
				.select()
				.from(guestDraftClaim)
				.where(and(eq(guestDraftClaim.userId, context.user.id), eq(guestDraftClaim.draftId, input.draftId)));
			return claim
				? {
						draftId: claim.draftId,
						revision: claim.revision,
						fingerprint: claim.fingerprint,
						resumeId: claim.resumeId,
						accountId: context.user.id,
					}
				: null;
		}),
};

/** Private and password-protected resumes use the same access rules for image bytes. */
export async function readGuestPhoto(request: Request, resumeId: string, assetId: string) {
	const user = await resolveUserFromRequestHeaders(request.headers);
	const [record] = await db.select().from(resume).where(eq(resume.id, resumeId));
	if (
		!record ||
		(user?.id !== record.userId &&
			(!record.isPublic || (record.password && !hasResumeAccess(request.headers, resumeId, record.password))))
	)
		return new Response(null, { status: 404 });
	const [asset] = await db
		.select()
		.from(guestPhotoAttempt)
		.where(
			and(
				eq(guestPhotoAttempt.id, assetId),
				eq(guestPhotoAttempt.userId, record.userId),
				eq(guestPhotoAttempt.resumeId, resumeId),
				eq(guestPhotoAttempt.state, "referenced"),
			),
		);
	if (!asset) return new Response(null, { status: 404 });
	const file = await getStorageService().read(asset.key);
	if (!file) return new Response(null, { status: 404 });
	return new Response(new Uint8Array(file.data), {
		headers: {
			"Content-Type": file.contentType ?? "application/octet-stream",
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"Cross-Origin-Resource-Policy": "same-origin",
		},
	});
}

/** Bounded cleanup; a crash at any point leaves a retryable ledger row. No prefix-wide deletion. */
export async function reclaimGuestPhotos(now = new Date()) {
	const rows = await db.transaction(async (tx) => {
		const expired = await tx
			.select()
			.from(guestPhotoAttempt)
			.where(
				and(
					lt(guestPhotoAttempt.expiresAt, now),
					lt(guestPhotoAttempt.leaseUntil, now),
					or(
						eq(guestPhotoAttempt.state, "preparing"),
						eq(guestPhotoAttempt.state, "deleting"),
						and(eq(guestPhotoAttempt.state, "referenced"), isNull(guestPhotoAttempt.resumeId)),
					),
				),
			)
			.limit(100)
			.for("update", { skipLocked: true });
		for (const row of expired)
			await tx.update(guestPhotoAttempt).set({ state: "deleting" }).where(eq(guestPhotoAttempt.id, row.id));
		return expired;
	});
	for (const row of rows) {
		try {
			await getStorageService().delete(row.key);
			await db
				.delete(guestPhotoAttempt)
				.where(and(eq(guestPhotoAttempt.id, row.id), eq(guestPhotoAttempt.state, "deleting")));
		} catch {
			/* Keep the ledger for the next bounded sweep. Never log resume content. */
		}
	}
}
