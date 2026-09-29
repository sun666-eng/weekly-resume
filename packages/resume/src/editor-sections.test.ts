import { describe, expect, it } from "vitest";
import { applyChineseBlankResume } from "@reactive-resume/schema/resume/blank-zh-cn";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { parseResumeDataForWrite } from "@reactive-resume/schema/resume/write";
import { enableEditorSection, getEditorSections, setEditorScenario } from "./editor-sections";

describe("editor section policy", () => {
	it("does not expose empty Chinese references or rewrite their hidden state", () => {
		const data = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
		expect(getEditorSections(data).find((s) => s.sectionId === "references")?.visible).toBe(false);
		expect(data.sections.references.hidden).toBe(false);
		expect(data.metadata.layout.pages[0]?.main).not.toContain("references");
	});
	it("keeps legacy reference data accessible and respects explicit hiding", () => {
		const data = structuredClone(sampleResumeData);
		data.metadata.page.locale = "zh-CN";
		expect(data.sections.references.items.length).toBeGreaterThan(0);
		const original = JSON.stringify(data);
		expect(getEditorSections(data).find((s) => s.sectionId === "references")?.visible).toBe(true);
		expect(JSON.stringify(data)).toBe(original);
		data.sections.references.hidden = true;
		expect(getEditorSections(data).find((s) => s.sectionId === "references")?.visible).toBe(false);
	});
	it("persists enabled sections through strict JSON import without changing content", () => {
		const data = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-TW");
		enableEditorSection(data, "references");
		enableEditorSection(data, "references");
		setEditorScenario(data, "academic");
		setEditorScenario(data, "academic");
		const restored = parseResumeDataForWrite(JSON.parse(JSON.stringify(data)));
		expect(restored.metadata.editor).toEqual({ version: 1, scenario: "academic", enabledSections: ["references"] });
		expect(restored.customSections.filter((s) => s.id === "zh-research")).toHaveLength(1);
		expect(restored.metadata.layout.pages[0]?.main.filter((id) => id === "references")).toHaveLength(1);
	});
	it("scenario changes preserve content, IDs, picture, hidden flags and existing layout", () => {
		const data = structuredClone(sampleResumeData);
		const before = structuredClone(data);
		for (const scenario of ["graduate", "experienced", "general"] as const) setEditorScenario(data, scenario);
		expect(data.basics).toEqual(before.basics);
		expect(data.picture).toEqual(before.picture);
		expect(data.sections).toEqual(before.sections);
		expect(data.summary).toEqual(before.summary);
		expect(data.metadata.layout.pages[0]?.main.slice(0, before.metadata.layout.pages[0]?.main.length)).toEqual(
			before.metadata.layout.pages[0]?.main,
		);
	});
});
