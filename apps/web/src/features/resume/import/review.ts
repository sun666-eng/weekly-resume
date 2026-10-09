import type { ResumeData } from "@reactive-resume/schema/resume/data";

export type ImportReviewIssue = { kind: "prose-title" | "missing-position"; label: string };

/** Heuristic review hints, not repairs: ambiguous source text must never be moved silently. */
export function getImportReviewIssues(data: ResumeData): ImportReviewIssue[] {
	const issues: ImportReviewIssue[] = [];
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
