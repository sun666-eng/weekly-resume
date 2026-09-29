import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@reactive-resume/env/server", () => ({ env: { FLAG_DISABLE_IMAGE_PROCESSING: false } }));
const { processImageForUpload } = await import("./service");

describe("real image processing", () => {
	it("retains actual alpha pixels after resize and encoding", async () => {
		const input = await sharp({
			create: { width: 1000, height: 600, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
		})
			.png()
			.toBuffer();
		const output = await processImageForUpload(
			new File([new Uint8Array(input)], "transparent.png", { type: "image/png" }),
		);
		const metadata = await sharp(output.data).metadata();
		const { data, info } = await sharp(output.data).raw().toBuffer({ resolveWithObject: true });
		expect(output.contentType).toBe("image/png");
		expect(metadata).toMatchObject({ format: "png", width: 800, hasAlpha: true });
		expect(info.channels).toBe(4);
		expect(data[3]).toBeGreaterThan(120);
		expect(data[3]).toBeLessThan(135);
	});

	it("returns a client error for real invalid bytes", async () => {
		await expect(
			processImageForUpload(new File(["not an image"], "broken.png", { type: "image/png" })),
		).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
	});
});
