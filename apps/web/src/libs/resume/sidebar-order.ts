import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { LeftSidebarSection } from "./section";
import { getEditorSections, scenarioSections } from "@reactive-resume/resume/editor-sections";
import {
	CHINESE_CAMPUS_SECTION_ID,
	CHINESE_INTERNSHIP_SECTION_ID,
	isChineseResumeLocale,
} from "@reactive-resume/schema/resume/cn-fields";
import { leftSidebarSections } from "./section";

const chineseSidebarOrder = [
	"picture",
	"basics",
	"education",
	"skills",
	`custom:${CHINESE_INTERNSHIP_SECTION_ID}`,
	"experience",
	"projects",
	`custom:${CHINESE_CAMPUS_SECTION_ID}`,
	"awards",
	"certifications",
	"summary",
	"publications",
	"profiles",
	"languages",
	"interests",
	"volunteer",
	"references",
	"custom",
] as const;

export type SidebarEntry = { kind: "builtin"; section: LeftSidebarSection } | { kind: "custom"; id: string };

export function getVisibleLeftSidebarSections(data: ResumeData): LeftSidebarSection[] {
	const hiddenSectionIds = new Set(
		getEditorSections(data)
			.filter((section) => !section.visible)
			.map((section) => section.sectionId),
	);

	return leftSidebarSections.filter(
		(section) =>
			section === "picture" || section === "basics" || section === "custom" || !hiddenSectionIds.has(section),
	);
}

const SAFE_PHOSPHOR_ICON = /^[a-z0-9-]+$/i;
const railFallbackSections = new Set<string>([...leftSidebarSections, "cover-letter"]);

export function getCustomRailPresentation(section: { title?: string; icon?: string; type?: string } | undefined): {
	label: string;
	iconName: string;
	fallbackSection: string;
} {
	const icon = section?.icon?.trim() ?? "";
	const type = section?.type?.trim() ?? "";
	return {
		label: section?.title?.trim() ?? "",
		iconName: icon !== "none" && SAFE_PHOSPHOR_ICON.test(icon) ? icon : "",
		fallbackSection: railFallbackSections.has(type) ? type : "experience",
	};
}

export function getInlineCustomSectionIds(data: ResumeData): string[] {
	if (!isChineseResumeLocale(data.metadata.page.locale)) return [];
	return [
		...new Set([
			CHINESE_INTERNSHIP_SECTION_ID,
			CHINESE_CAMPUS_SECTION_ID,
			...(data.metadata.editor
				? scenarioSections[data.metadata.editor.scenario].filter((id) =>
						data.customSections.some((section) => section.id === id),
					)
				: []),
		]),
	].filter((id) => data.customSections.some((section) => section.id === id && !section.hidden));
}

export function getSidebarEntries(data: ResumeData): SidebarEntry[] {
	if (!isChineseResumeLocale(data.metadata.page.locale)) {
		return getVisibleLeftSidebarSections(data).map((section) => ({ kind: "builtin", section }));
	}

	const hiddenSectionIds = new Set(
		getEditorSections(data)
			.filter((section) => !section.visible)
			.map((section) => section.sectionId),
	);

	const preferred = data.metadata.editor
		? scenarioSections[data.metadata.editor.scenario].map((id) =>
				data.customSections.some((section) => section.id === id) ? `custom:${id}` : id,
			)
		: [];
	const order = [...new Set(["picture", "basics", ...preferred, ...chineseSidebarOrder])];
	return order.flatMap((token): SidebarEntry[] => {
		if (token.startsWith("custom:")) {
			const id = token.slice("custom:".length);
			if (!data.customSections.some((section) => section.id === id) || hiddenSectionIds.has(id)) return [];
			return [{ kind: "custom" as const, id }];
		}

		const section = token as LeftSidebarSection;
		if (section !== "picture" && section !== "basics" && section !== "custom" && hiddenSectionIds.has(section)) {
			return [];
		}
		return [{ kind: "builtin" as const, section }];
	});
}
