import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Font } from "#react-pdf-renderer";
import { registerResumeFonts } from "./hooks/use-register-fonts";
import "./server";

vi.unmock("@reactive-resume/fonts");

describe("Node subset font path resolution", () => {
	it.each(["Noto Sans SC", "Noto Serif SC"])("resolves %s compact and rare-glyph full sources locally", (family) => {
		const data = structuredClone(defaultResumeData);
		data.basics.name = "中文简历";
		data.metadata.page.locale = "zh-CN";
		data.metadata.typography.body.fontFamily = family;
		data.metadata.typography.heading.fontFamily = family;
		registerResumeFonts(data);
		const subset = Font.getFont({ fontFamily: `${family} Compact`, fontWeight: 400 }).src;
		expect(typeof subset).toBe("string");
		expect(isAbsolute(subset)).toBe(true);
		expect(subset).toMatch(/400\.subset\.ttf$/);
		expect(existsSync(subset)).toBe(true);
		data.basics.name += "鿕";
		registerResumeFonts(data);
		const full = Font.getFont({ fontFamily: family, fontWeight: 400 }).src;
		expect(isAbsolute(full)).toBe(true);
		expect(full).toMatch(/400\.ttf$/);
		expect(existsSync(full)).toBe(true);
	});
});
