import { describe, expect, it } from "vitest";
import { fontList, getWebFont } from "./index";
import original from "./webfontlist.json";

describe("compact font metadata", () => {
	it("preserves all 508 public font records, preview URLs, file URLs and weights", () => {
		for (const font of original) {
			expect(getWebFont(font.family)).toEqual(font);
			expect(fontList.find((candidate) => candidate.family === font.family)).toEqual(font);
			expect(JSON.parse(JSON.stringify(getWebFont(font.family)))).toEqual(font);
		}
	});
	it("keeps a stable synchronous file map when a family is requested repeatedly", () => {
		const font = getWebFont("IBM Plex Serif");
		expect(font?.files).toBe(getWebFont("IBM Plex Serif")?.files);
		if (!font) throw new Error("Expected known font");
		const originalFiles = font.files;
		const replacement = { ...originalFiles };
		font.files = replacement;
		expect(getWebFont("IBM Plex Serif")?.files).toBe(replacement);
		font.files = originalFiles;
		expect(getWebFont("missing-font")).toBeUndefined();
	});
});
