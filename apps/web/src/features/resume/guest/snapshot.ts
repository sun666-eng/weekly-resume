import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { guestSnapshotSchema, restoreGuestSnapshot } from "@reactive-resume/resume/guest-draft";

export async function captureGuestSnapshot(name: string, input: ResumeData) {
	const data = structuredClone(input);
	let photo: { mime: string; base64: string } | null = null;
	if (data.picture.url) {
		const response = await fetch(data.picture.url);
		if (!response.ok) throw new Error("PHOTO_BYTES_UNAVAILABLE");
		const blob = await response.blob();
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
			reader.onerror = () => reject(new Error("PHOTO_BYTES_UNAVAILABLE"));
			reader.readAsDataURL(blob);
		});
		photo = { mime: blob.type, base64 };
	}
	data.picture.url = "";
	return guestSnapshotSchema.parse({ format: "weekly-resume-local-backup", version: 1, name, data, photo });
}

export const restoreLocalBackup = (text: string) => restoreGuestSnapshot(JSON.parse(text));

/** Recovery backups deliberately exclude runtime/auth/operation state. */
export async function downloadLocalBackup(name: string, data: ResumeData) {
	const snapshot = await captureGuestSnapshot(name, data);
	const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: "application/json" }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "weekly-resume-local-backup.json";
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
