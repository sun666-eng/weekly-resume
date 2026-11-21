import { describe, expect, it } from "vitest";
import { applyChineseBlankResume } from "@reactive-resume/schema/resume/blank-zh-cn";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildPreviewSampleResumeData, isResumeContentBlank } from "./empty-preview-sample";

describe("empty-preview-sample", () => {
	it("treats a freshly created blank default or Chinese blank resume as blank", () => {
		expect(isResumeContentBlank(undefined)).toBe(false);
		expect(isResumeContentBlank(structuredClone(defaultResumeData))).toBe(true);
		expect(isResumeContentBlank(applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN"))).toBe(true);
	});

	it("exits blank state as soon as any basics field, summary, photo, or section item is entered", () => {
		const withName = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
		withName.basics.name = "张";
		expect(isResumeContentBlank(withName)).toBe(false);

		const withSummary = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
		withSummary.summary.content = "<p>&nbsp;</p>";
		expect(isResumeContentBlank(withSummary)).toBe(true);
		withSummary.summary.content = "<p>后端开发工程师</p>";
		expect(isResumeContentBlank(withSummary)).toBe(false);

		const withPhoto = structuredClone(defaultResumeData);
		withPhoto.picture.url = "data:image/png;base64,AAAA";
		expect(isResumeContentBlank(withPhoto)).toBe(false);

		const withCustomItem = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
		const firstCustom = withCustomItem.customSections[0];
		if (firstCustom?.type === "experience") {
			firstCustom.items.push({
				id: "item-1",
				hidden: false,
				company: "星澜科技",
				position: "后端实习生",
				location: "",
				period: "2025.03 - 2025.08",
				website: { url: "", label: "", inlineLink: false },
				description: "",
				roles: [],
			});
		}
		expect(isResumeContentBlank(withCustomItem)).toBe(false);
	});

	it("builds an isolated Chinese sample carrying user template, colors, and typography without mutating userData", () => {
		const userBlank = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
		userBlank.metadata.template = "ditgar";
		userBlank.metadata.design.colors.primary = "#2563eb";
		userBlank.metadata.typography.body.fontSize = 11.5;
		const snapshotBefore = structuredClone(userBlank);

		const preview = buildPreviewSampleResumeData(userBlank, "zh-CN");

		expect(userBlank).toEqual(snapshotBefore);
		expect(preview.basics.name).toBe("林志远");
		expect(preview.metadata.template).toBe("ditgar");
		expect(preview.metadata.design.colors.primary).toBe("#2563eb");
		expect(preview.metadata.typography.body.fontSize).toBe(11.5);
	});
});
