import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildExportSample } from "./export-playground";

vi.mock("@/features/resume/export/use-resume-export", () => ({ useResumeExport: vi.fn() }));

describe("landing page export sample", () => {
	it("exports selected design with valid content without modifying shared defaults", () => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const original = structuredClone(defaultResumeData);
		const data = buildExportSample({ name: "Taylor Reed", accent: "#5987aa", typeface: "sans", template: "ditgar" });
		expect(resumeDataSchema.safeParse(data).success).toBe(true);
		expect(data.basics.name).toBe("Taylor Reed");
		expect(data.metadata.template).toBe("ditgar");
		expect(data.metadata.design.colors.primary).toBe("#5987aa");
		expect(data.metadata.typography.body.fontFamily).toBe("Helvetica");
		expect(data.sections.experience.items.length).toBeGreaterThan(0);
		expect(buildExportSample({ name: "  ", accent: "#c4a68c", typeface: "serif", template: "onyx" }).basics.name).toBe(
			"Alex Morgan",
		);
		expect(defaultResumeData).toEqual(original);
	});

	it("uses the Chinese technology resume for localized downloads", () => {
		const data = buildExportSample({ name: "周明", accent: "#27343d", typeface: "sans", template: "kakuna" }, "zh-CN");
		expect(resumeDataSchema.safeParse(data).success).toBe(true);
		expect(data.basics.name).toBe("周明");
		expect(data.sections.experience.title).toBe("实习经历");
		expect(data.metadata.layout.pages).toEqual([
			{ fullWidth: true, main: ["education", "experience", "projects", "skills"], sidebar: [] },
		]);
		expect(data.picture.hidden).toBe(true);
	});
});
