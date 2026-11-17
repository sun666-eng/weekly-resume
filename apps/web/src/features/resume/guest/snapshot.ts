import type { ResumeData } from "@reactive-resume/schema/resume/data";
import {
	GUEST_PHOTO_LIMIT,
	guestPhotoSchema,
	guestSnapshotSchema,
	restoreGuestSnapshot,
} from "@reactive-resume/resume/guest-draft";

const PHOTO_FETCH_TIMEOUT_MS = 2_000;

function normalizePhoto(mime: string, base64: string) {
	const photo = guestPhotoSchema.safeParse({
		mime: mime === "image/jpg" ? "image/jpeg" : mime,
		base64,
	});
	if (!photo.success) return null;
	const padding = photo.data.base64.endsWith("==") ? 2 : photo.data.base64.endsWith("=") ? 1 : 0;
	if ((photo.data.base64.length * 3) / 4 - padding > GUEST_PHOTO_LIMIT) return null;
	return photo.data;
}

function readDataUrlPhoto(url: string) {
	const comma = url.indexOf(",");
	if (!url.startsWith("data:") || comma < 5) return null;
	const header = url.slice(5, comma).split(";");
	if (!header.some((part) => part.toLowerCase() === "base64")) return null;
	const mime = header[0]?.split("/")[0] === "image" ? header[0].toLowerCase() : "";
	return normalizePhoto(mime, url.slice(comma + 1).replace(/\s/g, ""));
}

function firstSettled<T>(promise: Promise<T>, signal: AbortSignal) {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
		};
		if (signal.aborted) onAbort();
		else signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

function readBlobAsBase64(blob: Blob, signal: AbortSignal) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		const onAbort = () => {
			reader.abort();
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		reader.onload = () => {
			signal.removeEventListener("abort", onAbort);
			resolve(String(reader.result).split(",")[1] ?? "");
		};
		reader.onerror = () => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error("PHOTO_BYTES_UNAVAILABLE"));
		};
		reader.onabort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(new DOMException("Aborted", "AbortError"));
		};
		reader.readAsDataURL(blob);
	});
}

async function readFetchedPhoto(url: string) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PHOTO_FETCH_TIMEOUT_MS);
	try {
		const response = await firstSettled(fetch(url, { signal: controller.signal }), controller.signal);
		if (!response.ok) return null;
		const blob = await firstSettled(response.blob(), controller.signal);
		if (blob.size > GUEST_PHOTO_LIMIT) return null;
		const mime = (blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
		return normalizePhoto(mime, await firstSettled(readBlobAsBase64(blob, controller.signal), controller.signal));
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function readGuestPhoto(url: string) {
	try {
		if (url.startsWith("data:")) return readDataUrlPhoto(url);
		return await readFetchedPhoto(url);
	} catch {
		return null;
	}
}

export async function captureGuestSnapshot(name: string, input: ResumeData) {
	const data = structuredClone(input);
	const photo = data.picture.url ? await readGuestPhoto(data.picture.url) : null;
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
