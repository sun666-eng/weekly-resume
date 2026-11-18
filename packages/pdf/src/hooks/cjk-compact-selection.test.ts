import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Font } from "#react-pdf-renderer";
import { registerResumeFonts, resumeContentFitsCjkCompact, resumeContentScripts } from "./use-register-fonts";

const commonResume = (): ResumeData => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "张三";
	data.basics.headline = "软件工程师";
	data.summary.content = "<p>开发项目 Café 2026 — ① → ￥</p>";
	data.metadata.page.locale = "zh-CN";
	return data;
};

describe("CJK subset selection from the current resume", () => {
	it("includes content, default titles and the actual custom title resolver", () => {
		const data = commonResume();
		expect(resumeContentFitsCjkCompact(data)).toBe(true);
		expect(resumeContentFitsCjkCompact(data, () => "鿕")).toBe(false);
		data.sections.projects.title = "鿕项目";
		expect(resumeContentFitsCjkCompact(data)).toBe(false);
	});

	it.each(["鿕", "&#40917;", "&#x9fd5;", "&alpha;", "𠀀"])("checks rendered rich text %s", (text) => {
		const data = commonResume();
		data.summary.content = `<p>${text}</p>`;
		expect(resumeContentFitsCjkCompact(data)).toBe(false);
	});

	it("does not scan photo bytes or private notes as glyphs", () => {
		const data = commonResume();
		data.picture.url = "https://photo.invalid/鿕.png";
		data.metadata.notes = "鿕";
		expect(resumeContentFitsCjkCompact(data)).toBe(true);
	});

	it("recognizes supplementary Hanzi as Han in Latin locales", () => {
		const data = structuredClone(defaultResumeData);
		data.basics.name = "𠮷";
		expect(resumeContentScripts(data).has("han-simplified")).toBe(true);
	});

	it.each([
		["工作经历", "Noto Serif SC Compact"],
		["鿕", "Noto Serif SC"],
	])("registers a fallback when only the resolved title contains %s", (title, family) => {
		const data = structuredClone(defaultResumeData);
		data.basics.name = "Synthetic Resume";
		data.metadata.page.locale = "en-US";
		const typography = registerResumeFonts(data, () => title);
		expect(typography.body.fontFamily).toEqual(expect.arrayContaining([family]));
		expect(typography.heading.fontFamily).toEqual(expect.arrayContaining([family]));
	});

	it.each(["&#40917;", "&#x9fd5;"])("registers the full fallback for encoded rare Hanzi %s", (entity) => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = "en-US";
		data.summary.content = `<p>${entity}</p>`;
		expect(registerResumeFonts(data).body.fontFamily).toEqual(expect.arrayContaining(["Noto Serif SC"]));
	});

	it("switches fallback aliases after an in-place edit without clearing the registration cache", () => {
		const data = commonResume();
		const original = JSON.stringify(data);
		expect(registerResumeFonts(data).body.fontFamily).toContain("Noto Serif SC Compact");
		expect(Font.getFont({ fontFamily: "Noto Serif SC Compact" }).src).toMatch(/400\.subset\.ttf$/);
		expect(JSON.stringify(data)).toBe(original);
		data.basics.name += "鿕";
		expect(registerResumeFonts(data).body.fontFamily).toContain("Noto Serif SC");
		expect(registerResumeFonts(data).body.fontFamily).not.toContain("Noto Serif SC Compact");
		expect(Font.getFont({ fontFamily: "Noto Serif SC" }).src).toMatch(/400\.ttf$/);
		data.basics.name = "张三";
		expect(registerResumeFonts(data).body.fontFamily).toContain("Noto Serif SC Compact");
	});

	it("checks a typical Chinese resume in less than one millisecond on average", () => {
		const data = commonResume();
		data.summary.content = "<p>软件开发工程师 项目经验 数据分析 ①</p>".repeat(100);
		for (let n = 0; n < 20; n++) resumeContentFitsCjkCompact(data);
		const start = performance.now();
		for (let n = 0; n < 500; n++) resumeContentFitsCjkCompact(data);
		const averageMs = (performance.now() - start) / 500;
		console.info(`CJK coverage mean: ${averageMs.toFixed(4)} ms for ${data.summary.content.length} characters`);
		expect(averageMs).toBeLessThan(1);
	});
});
