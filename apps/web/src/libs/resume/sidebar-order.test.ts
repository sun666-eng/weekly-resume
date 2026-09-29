import { describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { getCustomRailPresentation, getSidebarEntries } from "./sidebar-order";

describe("sidebar order", () => {
	it("switching interface language ten times never changes document data or section order", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = "zh-CN";
		const original = JSON.stringify(data);
		const entries = getSidebarEntries(data);
		const previousLocale = i18n.locale;
		try {
			for (let i = 0; i < 10; i++) {
				i18n.loadAndActivate({ locale: ["zh-CN", "zh-TW", "en-US"][i % 3] ?? "en-US", messages: {} });
				expect(getSidebarEntries(data)).toEqual(entries);
				expect(JSON.stringify(data)).toBe(original);
			}
		} finally {
			i18n.activate(previousLocale);
		}
	});
	it("keeps the original editor order for an English resume", () => {
		const entries = getSidebarEntries(defaultResumeData);
		expect(entries.map((entry) => (entry.kind === "builtin" ? entry.section : entry.id)).slice(0, 6)).toEqual([
			"picture",
			"basics",
			"summary",
			"profiles",
			"experience",
			"education",
		]);
	});

	it("orders a Chinese blank resume around education, skills, internship, work, and projects", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = "zh-CN";
		data.customSections = [
			{
				id: "zh-internship",
				type: "experience",
				title: "实习经历",
				icon: "briefcase",
				columns: 1,
				hidden: false,
				showHeading: true,
				keepTogether: false,
				startOnNewPage: false,
				items: [],
			},
			{
				id: "zh-campus",
				type: "experience",
				title: "校园经历",
				icon: "users",
				columns: 1,
				hidden: false,
				showHeading: true,
				keepTogether: false,
				startOnNewPage: false,
				items: [],
			},
		];

		expect(getSidebarEntries(data).map((entry) => (entry.kind === "builtin" ? entry.section : entry.id))).toEqual([
			"picture",
			"basics",
			"education",
			"skills",
			"zh-internship",
			"experience",
			"projects",
			"zh-campus",
			"summary",
			"custom",
		]);
	});

	it("uses the stored custom-section title on the icon rail", () => {
		expect(getCustomRailPresentation({ title: "实习经历", icon: "briefcase", type: "experience" })).toEqual({
			label: "实习经历",
			iconName: "briefcase",
			fallbackSection: "experience",
		});
		expect(getCustomRailPresentation({ title: "校园经历", icon: "users", type: "experience" }).label).toBe("校园经历");
		expect(getCustomRailPresentation({ title: "  ", icon: "../bad", type: "not-a-section" })).toEqual({
			label: "",
			iconName: "",
			fallbackSection: "experience",
		});
	});
});
