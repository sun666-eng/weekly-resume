import type { ResumeData } from "./data";
import {
	CHINESE_CAMPUS_SECTION_ID,
	CHINESE_INTERNSHIP_SECTION_ID,
	chineseResumeFontFamily,
	chineseSectionTitles,
	isChineseResumeLocale,
} from "./cn-fields";

const emptyCustomSection = (id: string, title: string, icon: string): ResumeData["customSections"][number] => ({
	id,
	type: "experience",
	title,
	icon,
	columns: 1,
	hidden: false,
	showHeading: true,
	keepTogether: false,
	startOnNewPage: false,
	items: [],
});

/**
 * Shapes a freshly cloned blank resume for Chinese editing.
 * Call this only on a new empty resume. It does not rewrite saved resumes.
 */
export function applyChineseBlankResume(data: ResumeData, locale: string): ResumeData {
	if (!isChineseResumeLocale(locale)) return data;

	const titles = chineseSectionTitles(locale);
	const fontFamily = chineseResumeFontFamily(locale);

	data.metadata.page.locale = locale;
	data.metadata.editor = { version: 1, scenario: "general", enabledSections: [] };
	data.metadata.typography.body.fontFamily = fontFamily;
	data.metadata.typography.heading.fontFamily = fontFamily;
	data.metadata.layout.pages = [
		{
			fullWidth: true,
			sidebar: [],
			main: [
				"education",
				"skills",
				CHINESE_INTERNSHIP_SECTION_ID,
				"experience",
				"projects",
				CHINESE_CAMPUS_SECTION_ID,
				"awards",
				"certifications",
				"summary",
				"publications",
			],
		},
	];

	data.summary.title = titles.summary;
	data.sections.education.title = titles.education;
	data.sections.skills.title = titles.skills;
	data.sections.experience.title = titles.experience;
	data.sections.projects.title = titles.projects;
	data.sections.awards.title = titles.awards;
	data.sections.certifications.title = titles.certifications;
	data.sections.publications.title = titles.publications;
	data.sections.profiles.title = titles.profiles;
	data.sections.languages.title = titles.languages;
	data.sections.interests.title = titles.interests;
	data.sections.volunteer.title = titles.volunteer;
	data.sections.references.title = titles.references;

	const internship = emptyCustomSection(CHINESE_INTERNSHIP_SECTION_ID, titles.internship, "briefcase");
	const campus = emptyCustomSection(CHINESE_CAMPUS_SECTION_ID, titles.campus, "users");
	const preserved = data.customSections.filter(
		(section) => section.id !== CHINESE_INTERNSHIP_SECTION_ID && section.id !== CHINESE_CAMPUS_SECTION_ID,
	);
	data.customSections = [internship, campus, ...preserved];

	return data;
}
