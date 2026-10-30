import sharp from "sharp";
import { fingerprintGuestSnapshot, guestSnapshotSchema } from "@reactive-resume/resume/guest-draft";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { claimGuestDraft } from "../src/features/resume/guest-claim";
import { getStorageService } from "../src/features/storage/service";

const url = new URL(process.env.GUEST_TEST_DATABASE_URL ?? "http://invalid");
if (
	!url.pathname.startsWith("/guest_test_") ||
	!["127.0.0.1", "localhost"].includes(url.hostname) ||
	process.env.DATABASE_URL !== url.href
)
	throw new Error("Isolated database required");
const [userId, draftId] = process.argv.slice(2);
if (!userId || !draftId || !process.env.LOCAL_STORAGE_PATH?.includes("guest-validation"))
	throw new Error("Isolated fixture required");
const photo = await sharp({ create: { width: 20, height: 20, channels: 4, background: "#adcdef" } })
	.png()
	.toBuffer();
const snapshot = guestSnapshotSchema.parse({
	format: "weekly-resume-local-backup",
	version: 1,
	name: "进程中断虚构样本",
	data: structuredClone(defaultResumeData),
	photo: { mime: "image/png", base64: photo.toString("base64") },
});
const service = getStorageService();
const write = service.write.bind(service);
service.write = async (input) => {
	await write(input);
	process.exit(77);
};
await claimGuestDraft(userId, {
	draftId,
	revision: 1,
	fingerprint: await fingerprintGuestSnapshot(snapshot),
	expectedAccountId: userId,
	snapshot,
});
throw new Error("Crash point was not reached");
