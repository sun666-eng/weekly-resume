import type { ResumeData } from "@reactive-resume/schema/resume/data";

export type ImportReviewIssue = {
	kind: "prose-title" | "missing-position" | "contaminated-name" | "missing-name" | "ambiguous-header";
	label: string;
};

const NAME_FIELD_LABEL =
	/(?<![A-Za-z])(?:意\s*向\s*岗\s*位|求\s*职\s*意\s*向|求\s*职\s*目\s*标|目\s*标\s*职\s*位|job objective|desired position|target position|objective|电\s*子\s*邮\s*箱|电\s*子\s*邮\s*件|邮\s*箱|e-?mail|手\s*机\s*号\s*码|手\s*机\s*号|手\s*机|电\s*话\s*号\s*码|电\s*话|tel(?:ephone)?|phone|mobile)\s*[:：]/iu;
const UNDELIMITED_OBJECTIVE = /(?:意\s*向\s*岗\s*位|求\s*职\s*意\s*向|求\s*职\s*目\s*标|目\s*标\s*职\s*位)\s+\S/iu;

/** Heuristic review hints, not repairs: ambiguous source text must never be moved silently. */
export function getImportReviewIssues(data: ResumeData): ImportReviewIssue[] {
	const issues: ImportReviewIssue[] = [];
	const name = data.basics.name.trim();
	const headline = data.basics.headline.trim();
	if (/意\s*向\s*岗\s*$/u.test(name) && /^位\s*[:：]/u.test(headline)) {
		issues.push({ kind: "ambiguous-header", label: `${name} / ${headline}` });
	} else if (NAME_FIELD_LABEL.test(name) || UNDELIMITED_OBJECTIVE.test(name)) {
		issues.push({ kind: "contaminated-name", label: name });
	} else if (!name && headline) {
		issues.push({ kind: "missing-name", label: headline });
	}
	for (const section of [data.summary, ...data.customSections]) {
		const title = section.title.trim();
		if (/^[•◦‣·*]/u.test(title) || (title.length > 48 && /[。！？.!?]/u.test(title))) {
			issues.push({ kind: "prose-title", label: title });
		}
	}
	for (const section of [data.sections.experience, ...data.customSections.filter((s) => s.type === "experience")]) {
		for (const item of section.items) {
			if (item.company.trim() && !item.position.trim() && item.roles.length === 0 && item.description.trim()) {
				issues.push({ kind: "missing-position", label: item.company });
			}
		}
	}
	return issues;
}
