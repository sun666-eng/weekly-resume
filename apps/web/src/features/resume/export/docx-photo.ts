import type { ResumeData } from "@reactive-resume/schema/resume/data";

/** Fetch authenticated images in the browser and hand the renderer portable PNG bytes. */
export async function prepareDocxPhoto(data: ResumeData): Promise<Uint8Array | undefined> {
	if (data.picture.hidden || !data.picture.url) return;
	const response = await fetch(data.picture.url);
	if (!response.ok) throw new Error("PHOTO_UNAVAILABLE");
	const url = URL.createObjectURL(await response.blob());
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(data.picture.size * 2);
		canvas.height = Math.round(canvas.width / data.picture.aspectRatio);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("PHOTO_CONVERSION_FAILED");
		const scale = (data.picture.fit === "contain" ? Math.min : Math.max)(
			canvas.width / image.naturalWidth,
			canvas.height / image.naturalHeight,
		);
		const width = image.naturalWidth * scale;
		const height = image.naturalHeight * scale;
		context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
		const png = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PHOTO_CONVERSION_FAILED"))), "image/png"),
		);
		return new Uint8Array(await png.arrayBuffer());
	} finally {
		URL.revokeObjectURL(url);
	}
}
