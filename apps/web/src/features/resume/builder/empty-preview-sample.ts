import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { createChineseTemplateSample } from "@reactive-resume/schema/resume/sample-zh-cn";

function stripRichTextHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.trim();
}

/**
 * Returns true only when the resume holds zero user-entered text, items, or photo.
 * Used exclusively to offer a read-only, non-mutating sample layout preview.
 */
export function isResumeContentBlank(data: ResumeData | undefined): boolean {
	if (!data) return false;
	if (data.picture.url.trim() !== "") return false;

	const { basics } = data;
	const textValues = [
		basics.name,
		basics.headline,
		basics.email,
		basics.phone,
		basics.location,
		basics.website.url,
		basics.blog?.url ?? "",
		basics.github?.url ?? "",
		basics.gender ?? "",
		basics.age ?? "",
		basics.politicalStatus ?? "",
		basics.politicalStatusOther ?? "",
		basics.address ?? "",
	];
	if (textValues.some((value) => value.trim() !== "")) return false;
	if (basics.customFields.length > 0) return false;
	if (stripRichTextHtml(data.summary.content) !== "") return false;

	for (const section of Object.values(data.sections)) {
		if (section.items.length > 0) return false;
	}

	for (const customSection of data.customSections) {
		if (customSection.items.length > 0) return false;
	}

	return true;
}

/**
 * Synthesizes an ephemeral preview-only ResumeData combining fictional sample
 * content with the user's live template, color, typography, and stylesheet settings.
 * Never mutates the input ResumeData.
 */
export function buildPreviewSampleResumeData(userData: ResumeData, uiLocale: string): ResumeData {
	const chinese = isChineseResumeLocale(userData.metadata.page.locale || uiLocale);
	const sample = chinese ? createChineseTemplateSample(userData.metadata.template) : structuredClone(sampleResumeData);

	sample.metadata.template = userData.metadata.template;
	sample.metadata.design = structuredClone(userData.metadata.design);
	sample.metadata.typography = structuredClone(userData.metadata.typography);
	sample.metadata.page.format = userData.metadata.page.format;
	if (userData.metadata.stylesheet) {
		sample.metadata.stylesheet = structuredClone(userData.metadata.stylesheet);
	} else {
		delete sample.metadata.stylesheet;
	}

	return sample;
}
