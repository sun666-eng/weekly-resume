import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { chineseSectionTitles, isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { getSectionAvailability } from "./section-availability";

export type EditorScenario = NonNullable<ResumeData["metadata"]["editor"]>["scenario"];
export const scenarioSections: Record<EditorScenario, string[]> = {
	general: ["education", "skills", "experience", "projects", "summary"],
	graduate: ["education", "skills", "zh-internship", "projects", "zh-campus", "awards", "certifications", "summary"],
	experienced: ["summary", "experience", "projects", "skills", "education", "certifications"],
	academic: ["education", "zh-research", "publications", "skills", "awards"],
};

export function sectionHasContent(data: ResumeData, id: string): boolean {
	if (id === "summary") return Boolean(data.summary.content.trim());
	const section =
		Object.entries(data.sections).find(([key]) => key === id)?.[1] ??
		data.customSections.find((item) => item.id === id);
	return Boolean(section?.items.length);
}

/** Editor visibility never changes the document's hidden flags or content. */
export function getEditorSections(data: ResumeData) {
	const editor = data.metadata.editor;
	const defaults = editor ? scenarioSections[editor.scenario] : scenarioSections.general;
	return getSectionAvailability(data).map((section) => ({
		...section,
		hasContent: sectionHasContent(data, section.sectionId),
		visible:
			!section.hidden &&
			((!editor && !isChineseResumeLocale(data.metadata.page.locale)) ||
				defaults.includes(section.sectionId) ||
				Boolean(editor?.enabledSections.includes(section.sectionId)) ||
				sectionHasContent(data, section.sectionId) ||
				data.customSections.some(
					(item) =>
						item.id === section.sectionId &&
						(!editor || !["zh-campus", "zh-internship", "zh-research"].includes(item.id)),
				)),
	}));
}

export function setEditorScenario(data: ResumeData, scenario: EditorScenario) {
	data.metadata.editor = { version: 1, scenario, enabledSections: data.metadata.editor?.enabledSections ?? [] };
	const titles = chineseSectionTitles(data.metadata.page.locale);
	const managedSections = [
		{ id: "zh-internship", title: titles.internship, icon: "briefcase" },
		{ id: "zh-campus", title: titles.campus, icon: "users" },
		{ id: "zh-research", title: data.metadata.page.locale === "zh-TW" ? "研究經歷" : "研究经历", icon: "flask" },
	];
	for (const section of managedSections) {
		if (!scenarioSections[scenario].includes(section.id) || data.customSections.some((item) => item.id === section.id))
			continue;
		data.customSections.push({
			...section,
			type: "experience",
			columns: 1,
			hidden: false,
			showHeading: true,
			keepTogether: false,
			startOnNewPage: false,
			items: [],
		});
	}
	// Preserve existing page positions. Only place newly introduced sections.
	const placed = new Set(data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]));
	const firstPage = data.metadata.layout.pages[0];
	if (firstPage) for (const id of scenarioSections[scenario]) if (!placed.has(id)) firstPage.main.push(id);
}

export function enableEditorSection(data: ResumeData, id: string) {
	if (data.metadata.editor || isChineseResumeLocale(data.metadata.page.locale)) {
		data.metadata.editor ??= { version: 1, scenario: "general", enabledSections: [] };
		if (!data.metadata.editor.enabledSections.includes(id)) data.metadata.editor.enabledSections.push(id);
	}
	const placed = data.metadata.layout.pages.some((page) => page.main.includes(id) || page.sidebar.includes(id));
	if (!placed && data.metadata.layout.pages[0]) data.metadata.layout.pages[0].main.push(id);
}
