import { describe, expect, it } from "vitest";
import { normalizePictureUrl } from "./picture-url";

describe("normalizePictureUrl", () => {
	it.each(["localhost", "127.0.0.1", "[::1]"])("uses the active origin for loopback upload host %s", (host) => {
		expect(normalizePictureUrl(`http://${host}:3200/api/uploads/user/pictures/photo.jpeg`, "http://127.0.0.1:3200"))
			.toBe("http://127.0.0.1:3200/api/uploads/user/pictures/photo.jpeg");
	});
	it("supports legacy paths and preserves query strings", () => {
		expect(normalizePictureUrl("/uploads/user/photo.png?v=1", "https://resume.example"))
			.toBe("https://resume.example/api/uploads/user/photo.png?v=1");
	});
	it.each([
		"https://cdn.example/api/uploads/photo.png",
		"http://localhost:3100/api/uploads/photo.png",
		"https://localhost:3200/api/uploads/photo.png",
		"http://localhost:3200/photos/sample.png",
		"data:image/png;base64,abc",
		"",
	])("preserves unrelated source %s", (url) => {
		expect(normalizePictureUrl(url, "http://127.0.0.1:3200")).toBe(url);
	});
});
