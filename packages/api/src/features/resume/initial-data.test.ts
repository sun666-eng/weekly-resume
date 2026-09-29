import { describe, expect, it } from "vitest";
import { CHINESE_CAMPUS_SECTION_ID, CHINESE_INTERNSHIP_SECTION_ID } from "@reactive-resume/schema/resume/cn-fields";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createResumeData } from "./initial-data";

describe("createResumeData", () => {
	it("persists the selected career stage without seeding personal facts", () => {
		for (const scenario of ["graduate", "experienced", "academic"] as const) {
			const data = createResumeData({ locale: "zh-CN", scenario });
			expect(data.metadata.editor?.scenario).toBe(scenario);
			expect(data.basics.name).toBe("");
			expect(data.picture.url).toBe("");
			expect(data.customSections.every((section) => section.items.length === 0)).toBe(true);
		}
	});
	it("seeds one canonical empty stylesheet source", () => {
		expect(createResumeData({}).metadata.stylesheet).toEqual({
			mode: "semantic",
			source: { languageVersion: 1, text: "@version 1;\n" },
		});
	});

	it("clones normal and sample defaults instead of mutating shared data", () => {
		const normal = createResumeData({ locale: "de-DE" });
		const sample = createResumeData({ withSampleData: true, name: "Sample Person", locale: "de-DE" });

		normal.basics.name = "Mutated";
		sample.metadata.page.locale = "en-US";

		expect(defaultResumeData.basics.name).toBe("");
		expect(defaultResumeData.metadata.page.locale).not.toBe("de-DE");
		expect(sample.basics.name).toBe("Sample Person");
	});

	it("creates a blank Chinese resume from the interface locale and leaves English and sample resumes alone", () => {
		const chinese = createResumeData({ locale: "zh-CN" });
		const english = createResumeData({ locale: "en-US" });
		const sample = createResumeData({ withSampleData: true, locale: "zh-CN", name: "林知远" });

		expect(chinese.metadata.page.locale).toBe("zh-CN");
		expect(chinese.metadata.layout.pages[0]?.fullWidth).toBe(true);
		expect(chinese.metadata.layout.pages[0]?.main).toEqual(
			expect.arrayContaining([CHINESE_INTERNSHIP_SECTION_ID, CHINESE_CAMPUS_SECTION_ID, "education", "experience"]),
		);
		expect(chinese.basics.name).toBe("");
		expect(english.metadata.layout.pages).toEqual(defaultResumeData.metadata.layout.pages);
		expect(english.customSections).toEqual([]);
		expect(sample.basics.name).toBe("林知远");
		expect(sample.customSections.some((section) => section.id === CHINESE_INTERNSHIP_SECTION_ID)).toBe(false);
	});
});
