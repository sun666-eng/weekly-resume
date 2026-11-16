import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { fingerprintGuestSnapshot, guestSnapshotSchema } from "@reactive-resume/resume/guest-draft";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

// Opt-in only. Never silently fall back to DATABASE_URL or the running application's database.
const url = process.env.GUEST_TEST_DATABASE_URL;
const allowed =
	url &&
	new URL(url).pathname.startsWith("/guest_test_") &&
	new URL(url).port === "35412" &&
	new URL(url).hostname === "127.0.0.1";
if (url && !allowed)
	throw new Error("Guest integration tests require an explicitly isolated local guest_test_ database");

vi.mock("@reactive-resume/env/server", async (original) => {
	const { env } = await original<typeof import("@reactive-resume/env/server")>();
	return {
		env: {
			...env,
			LOCAL_STORAGE_PATH: process.env.GUEST_TEST_STORAGE_PATH,
			S3_ACCESS_KEY_ID: undefined,
			S3_SECRET_ACCESS_KEY: undefined,
			S3_BUCKET: undefined,
			FLAG_DISABLE_IMAGE_PROCESSING: true,
		},
	};
});

describe.skipIf(!allowed)("guest claims — real isolated PostgreSQL", () => {
	let db: typeof import("@reactive-resume/db/client")["db"];
	let schema: typeof import("@reactive-resume/db/schema");
	let claim: typeof import("./guest-claim")["claimGuestDraft"];
	const userId = crypto.randomUUID();
	const otherUserId = crypto.randomUUID();
	const drafts: string[] = [];
	beforeAll(async () => {
		if (
			!process.env.GUEST_TEST_STORAGE_PATH?.includes("guest-integration-20261022") ||
			!process.env.GUEST_TEST_STORAGE_PATH.includes("guest-validation")
		)
			throw new Error("Explicit task-only storage required");
		process.env.DATABASE_URL = url;
		({ db } = await import("@reactive-resume/db/client"));
		schema = await import("@reactive-resume/db/schema");
		({ claimGuestDraft: claim } = await import("./guest-claim"));
		console.info("Synthetic guest claim fixture user IDs:", userId, otherUserId);
		for (const id of [userId, otherUserId])
			await db.insert(schema.user).values({
				id,
				name: "虚构游客测试",
				email: `${id}@example.invalid`,
				username: `g-${id}`,
				displayUsername: `g-${id}`,
				emailVerified: false,
			});
	}, 60_000);
	afterAll(async () => {
		if (!db) return;
		for (const id of [userId, otherUserId]) await db.delete(schema.user).where(eq(schema.user.id, id));
	});
	const input = async () => {
		const snapshot = guestSnapshotSchema.parse({
			format: "weekly-resume-local-backup",
			version: 1,
			name: "原创并发样本",
			data: structuredClone(defaultResumeData),
			photo: null,
		});
		snapshot.data.basics.name = "林知禾";
		const draftId = crypto.randomUUID();
		drafts.push(draftId);
		return {
			draftId,
			revision: 12,
			snapshot,
			fingerprint: await fingerprintGuestSnapshot(snapshot),
			expectedAccountId: userId,
		};
	};
	it("races two first claims and produces exactly one resume, initial version and claim", async () => {
		const request = await input();
		const [a, b] = await Promise.all([claim(userId, request), claim(userId, request)]);
		expect(a.resume.id).toBe(b.resume.id);
		expect(a.resume.isPublic).toBe(false);
		const rows = await db
			.select()
			.from(schema.resume)
			.where(and(eq(schema.resume.userId, userId), eq(schema.resume.id, a.resume.id)));
		const versions = await db.select().from(schema.resumeVersion).where(eq(schema.resumeVersion.resumeId, a.resume.id));
		const claims = await db
			.select()
			.from(schema.guestDraftClaim)
			.where(and(eq(schema.guestDraftClaim.userId, userId), eq(schema.guestDraftClaim.draftId, request.draftId)));
		expect([rows.length, versions.length, claims.length]).toEqual([1, 1, 1]);
		// Discard the first response and repeat: this is the client-visible lost-response behavior.
		expect((await claim(userId, request)).resume.id).toBe(a.resume.id);
	});
	it("rejects changed content with the same client revision", async () => {
		const request = await input();
		await claim(userId, request);
		request.snapshot.data.metadata.notes = "第二份虚构内容";
		request.fingerprint = await fingerprintGuestSnapshot(request.snapshot);
		await expect(claim(userId, request)).rejects.toMatchObject({ code: "CONFLICT" });
	});
	it("does not resurrect deleted results or expose another user's claim", async () => {
		const request = await input();
		const first = await claim(userId, request);
		await expect(claim(otherUserId, request)).rejects.toMatchObject({ code: "CONFLICT" });
		const second = await claim(otherUserId, { ...request, expectedAccountId: otherUserId });
		expect(second.resume.id).not.toBe(first.resume.id);
		await db.delete(schema.resume).where(eq(schema.resume.id, first.resume.id));
		await expect(claim(userId, request)).rejects.toMatchObject({ code: "GONE" });
	});
	it("first claims with different snapshots compete without silently replacing content", async () => {
		const a = await input();
		const b = structuredClone(a);
		b.snapshot.data.basics.name = "苏映秋";
		b.fingerprint = await fingerprintGuestSnapshot(b.snapshot);
		const results = await Promise.allSettled([claim(userId, a), claim(userId, b)]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
	});
	it("rolls back the resume and claim if initial version creation fails", async () => {
		const request = await input();
		const bytes = await sharp({ create: { width: 20, height: 24, channels: 4, background: "#849cab" } })
			.png()
			.toBuffer();
		request.snapshot.photo = { mime: "image/png", base64: bytes.toString("base64") };
		request.fingerprint = await fingerprintGuestSnapshot(request.snapshot);
		const functionName = `guest_test_fail_${userId.replaceAll("-", "")}`;
		// Generated UUID and fixed strings only; this fixture is restricted to the opt-in isolated database.
		await db.execute(
			sql.raw(
				`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${userId}' THEN RAISE EXCEPTION 'guest fixture failure'; END IF; RETURN NEW; END $$`,
			),
		);
		await db.execute(
			sql.raw(
				`CREATE TRIGGER ${functionName} BEFORE INSERT ON resume_version FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
			),
		);
		try {
			await expect(claim(userId, request)).rejects.toThrow();
			expect(
				await db
					.select()
					.from(schema.guestDraftClaim)
					.where(and(eq(schema.guestDraftClaim.userId, userId), eq(schema.guestDraftClaim.draftId, request.draftId))),
			).toHaveLength(0);
			const [staged] = await db
				.select()
				.from(schema.guestPhotoAttempt)
				.where(and(eq(schema.guestPhotoAttempt.userId, userId), eq(schema.guestPhotoAttempt.state, "preparing")));
			if (!staged) throw new Error("The failed photo claim must retain its cleanup ledger");
			const { getStorageService } = await import("../storage/service");
			expect(await getStorageService().read(staged.key)).not.toBeNull();
			const { reclaimGuestPhotos } = await import("./guest-claim");
			await reclaimGuestPhotos(new Date(Date.now() + 25 * 60 * 60_000));
			expect(await getStorageService().read(staged.key)).toBeNull();
		} finally {
			await db.execute(sql.raw(`DROP TRIGGER ${functionName} ON resume_version`));
			await db.execute(sql.raw(`DROP FUNCTION ${functionName}()`));
		}
		expect((await claim(userId, request)).matchesClaimedSnapshot).toBe(true);
	});
	it("validates photo bytes, retains successful references during cleanup, and detects later cloud edits", async () => {
		const request = await input();
		const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#aabbcc" } })
			.png()
			.toBuffer();
		request.snapshot.photo = { mime: "image/png", base64: bytes.toString("base64") };
		request.fingerprint = await fingerprintGuestSnapshot(request.snapshot);
		const results = await Promise.all([claim(userId, request), claim(userId, request)]);
		expect(results[0].resume.id).toBe(results[1].resume.id);
		const { reclaimGuestPhotos } = await import("./guest-claim");
		await reclaimGuestPhotos(new Date(Date.now() + 25 * 60 * 60_000));
		const remaining = await db
			.select()
			.from(schema.guestPhotoAttempt)
			.where(
				and(eq(schema.guestPhotoAttempt.userId, userId), eq(schema.guestPhotoAttempt.resumeId, results[0].resume.id)),
			);
		expect(remaining).toHaveLength(1);
		const [asset] = remaining;
		if (!asset) throw new Error("Missing referenced photo");
		expect(asset.state).toBe("referenced");
		const { getStorageService } = await import("../storage/service");
		expect(await getStorageService().read(asset.key)).not.toBeNull();
		const changed = structuredClone(results[0].resume.data);
		changed.basics.name = "账号里的后续修改";
		await db.update(schema.resume).set({ data: changed }).where(eq(schema.resume.id, results[0].resume.id));
		expect((await claim(userId, request)).matchesClaimedSnapshot).toBe(false);
		request.snapshot.photo.mime = "image/jpeg";
		request.fingerprint = await fingerprintGuestSnapshot(request.snapshot);
		await expect(claim(userId, request)).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await db.delete(schema.resume).where(eq(schema.resume.id, results[0].resume.id));
		await reclaimGuestPhotos(new Date(Date.now() + 25 * 60 * 60_000));
		expect(await getStorageService().read(asset.key)).toBeNull();
	});
	it("recovers a staged file after the actual claim process exits between file write and database commit", async () => {
		const draftId = crypto.randomUUID();
		const tooling = createRequire(resolve("../../tooling/package.json"));
		const loader = pathToFileURL(tooling.resolve("tsx")).href;
		const storagePath = process.env.GUEST_TEST_STORAGE_PATH;
		const error = await promisify(execFile)(
			process.execPath,
			["--import", loader, resolve("tests/guest-photo-crash.ts"), userId, draftId],
			{
				env: {
					...process.env,
					DATABASE_URL: url,
					GUEST_TEST_DATABASE_URL: url,
					LOCAL_STORAGE_PATH: storagePath,
					S3_ACCESS_KEY_ID: "",
					S3_SECRET_ACCESS_KEY: "",
					S3_BUCKET: "",
					REDIS_URL: "",
				},
				timeout: 25_000,
			},
		).catch((error: unknown) => error);
		expect(error).toHaveProperty("code", 77);
		const [attempt] = await db
			.select()
			.from(schema.guestPhotoAttempt)
			.where(and(eq(schema.guestPhotoAttempt.userId, userId), eq(schema.guestPhotoAttempt.state, "preparing")));
		if (!attempt) throw new Error("Crash must leave its durable staging ledger");
		const { getStorageService } = await import("../storage/service");
		expect(await getStorageService().read(attempt.key)).not.toBeNull();
		expect(
			await db
				.select()
				.from(schema.guestDraftClaim)
				.where(and(eq(schema.guestDraftClaim.userId, userId), eq(schema.guestDraftClaim.draftId, draftId))),
		).toHaveLength(0);
		const { reclaimGuestPhotos } = await import("./guest-claim");
		await reclaimGuestPhotos(new Date(Date.now() + 25 * 60 * 60_000));
		expect(await getStorageService().read(attempt.key)).toBeNull();
	}, 30_000);
	it("rejects truncated image pixels even when image compression is disabled", async () => {
		const request = await input();
		const bytes = await sharp({ create: { width: 50, height: 50, channels: 4, background: "#5a738d" } })
			.png()
			.toBuffer();
		const truncated = bytes.subarray(0, bytes.length - 25);
		await expect(sharp(truncated).metadata()).resolves.toHaveProperty("width", 50);
		request.snapshot.photo = { mime: "image/png", base64: truncated.toString("base64") };
		request.fingerprint = await fingerprintGuestSnapshot(request.snapshot);
		await expect(claim(userId, request)).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
