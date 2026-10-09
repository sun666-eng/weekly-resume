import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type { Locale } from "@reactive-resume/utils/locale";
import type { ImportIssue } from "./personal-info";
import {
	chineseResumeFontFamily,
	chineseSectionTitles,
	isChineseResumeLocale,
} from "@reactive-resume/schema/resume/cn-fields";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { isImportName } from "./personal-info";

export type ResumeTextOptions = { locale?: Locale; fallbackLocale?: Locale };
export type ImportAnalysis = { data: ResumeData; issues: ImportIssue[]; detectedLocale: "zh-CN" | "en-US" | null };

/** Body content wins over PDF metadata, interface language and model defaults. Ambiguity stays explicit. */
export function detectResumeTextLocale(text: string): ImportAnalysis["detectedLocale"] {
	const body = text.replace(/<[^>]*>/g, " ").replace(/(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+/gi, " ");
	const han = (body.match(/\p{Script=Han}/gu) ?? []).length;
	const latin = (body.match(/[A-Za-z]/g) ?? []).length;
	const ratio = han / Math.max(1, han + latin);
	const chineseHeadings = (
		body.match(/(?:教育背景|教育经历|工作经历|项目经历|专业技能|个人信息|实习经历|自我评价)/g) ?? []
	).length;
	const englishHeadings = (
		body.match(/\b(?:education|experience|skills|projects|summary|personal information)\b/gi) ?? []
	).length;
	if (han >= 12 && (ratio >= 0.6 || (chineseHeadings >= 2 && chineseHeadings > englishHeadings && ratio >= 0.15)))
		return "zh-CN";
	if (latin >= 60 && ratio <= 0.05) return "en-US";
	if (englishHeadings >= 2 && latin >= 20 && ratio <= 0.1) return "en-US";
	return null;
}

export function resolveResumeImportLocale(text: string, options: ResumeTextOptions = {}) {
	const detectedLocale = detectResumeTextLocale(text);
	const locale = options.locale ?? detectedLocale ?? options.fallbackLocale ?? "en-US";
	const issues: ImportIssue[] =
		!options.locale && !detectedLocale ? [{ code: "uncertain-language", field: "locale", raw: locale }] : [];
	return { locale, detectedLocale, issues };
}

/** Only generated blank defaults are localized; authored headings, styles and layout survive. */
export function applyResumeImportLocale(data: ResumeData, locale: string): void {
	data.metadata.page.locale = locale;
	if (!isChineseResumeLocale(locale)) return;
	const titles = chineseSectionTitles(locale);
	if (!data.summary.title) data.summary.title = titles.summary;
	for (const key of Object.keys(data.sections) as Exclude<SectionType, "summary">[]) {
		if (!data.sections[key].title) data.sections[key].title = titles[key];
	}
	for (const key of ["body", "heading"] as const) {
		if (data.metadata.typography[key].fontFamily === defaultResumeData.metadata.typography[key].fontFamily)
			data.metadata.typography[key].fontFamily = chineseResumeFontFamily(locale);
	}
}

/** AI fallback examines source facts, excluding generated section labels and presentation settings. */
function resumeBodyText(data: ResumeData): string {
	const parts: string[] = [
		data.basics.name,
		data.basics.headline,
		data.basics.location,
		data.basics.address ?? "",
		data.summary.content,
	];
	const collect = (value: unknown): void => {
		if (typeof value === "string") parts.push(value);
		else if (Array.isArray(value)) value.forEach(collect);
		else if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value))
				if (!["id", "icon", "url", "fontFamily"].includes(key)) collect(item);
		}
	};
	for (const section of Object.values(data.sections)) collect(section.items);
	for (const section of data.customSections) collect(section.items);
	return parts.join("\n");
}

export function finalizeResumeImport(
	data: ResumeData,
	options: ResumeTextOptions & { sourceText?: string } = {},
): ImportAnalysis {
	const copy = structuredClone(data);
	const sourceLocale = options.sourceText ? detectResumeTextLocale(options.sourceText) : null;
	const text = sourceLocale && options.sourceText ? options.sourceText : resumeBodyText(copy);
	const language = resolveResumeImportLocale(text, options);
	applyResumeImportLocale(copy, language.locale);
	const issues = [...language.issues];
	if (!copy.basics.name.trim()) issues.push({ code: "missing-name", field: "name", raw: "" });
	else if (!isImportName(copy.basics.name, true))
		issues.push({ code: "unmapped-field", field: "name", raw: copy.basics.name });
	return { data: copy, issues, detectedLocale: language.detectedLocale };
}
