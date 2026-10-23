import type { ChinaReferenceOptions, ChinaReferenceReport, ChinaRule } from "./types";
import { PDF_SECTION_HEADING_LOOKUP } from "../ats/section-aliases";
import { CHINA_JOB_KNOWLEDGE } from "./snapshot";

// Generated from knowledge/china-job-rules. Runtime never reads repository files.
export { CHINA_JOB_KNOWLEDGE };
export const CHINA_AUDIENCES = ["all", "campus", "intern", "experienced", "career_switcher"] as const;
export const getChinaRole = (id: string) => CHINA_JOB_KNOWLEDGE.roles.find((role) => role.id === id);
export const getChinaRule = (id: string) => CHINA_JOB_KNOWLEDGE.rules.find((rule) => rule.id === id);
export const CHINA_SKILL_TERMS: readonly string[] = [
	...new Set(CHINA_JOB_KNOWLEDGE.roles.flatMap((role) => Object.values(role.keywordGroups).flat())),
];

const fold = (text: string) => text.normalize("NFKC").toLowerCase();

/** Latin names need word boundaries; Han phrases may be embedded in unspaced prose. */
export function containsChinaKeyword(text: string, keyword: string): boolean {
	const normalized = fold(text);
	const term = fold(keyword);
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
	const left = /^[\p{Script=Latin}\p{N}]/u.test(term) ? "(?<![\\p{Script=Latin}\\p{N}_])" : "";
	const right = /[\p{Script=Latin}\p{N}]$/u.test(term) ? "(?![\\p{Script=Latin}\\p{N}_])" : "";
	return new RegExp(`${left}${escaped}${right}`, "u").test(normalized);
}

export function buildChinaReference(
	text: string,
	options: ChinaReferenceOptions,
	sections: readonly string[] = [],
	jobDescription = "",
): ChinaReferenceReport | null {
	const role = options.targetRoleId ? getChinaRole(options.targetRoleId) : undefined;
	if (!role) return null;
	const audience = options.audience ?? "all";
	const detectedSections = sections.length
		? sections
		: text
				.split(/\r?\n/)
				.map((line) => PDF_SECTION_HEADING_LOOKUP.get(line.trim().toLowerCase()))
				.filter((section) => !!section);
	const applicable = (rule: ChinaRule) =>
		rule.audiences.includes("all") || audience === "all" || rule.audiences.includes(audience);
	const keywords = [...new Set(Object.values(role.keywordGroups).flat())];
	const relevantText = `${jobDescription}\n${text}\n${role.name}\n${keywords.join(" ")}`;
	const sectionMatches = (rule: ChinaRule) => detectedSections.some((section) => section === rule.section);
	const keywordMatches = (rule: ChinaRule) => rule.tags.filter((tag) => containsChinaKeyword(relevantText, tag)).length;
	const stageMatches = (rule: ChinaRule) => audience !== "all" && rule.audiences.includes(audience);
	const rank = (rule: ChinaRule) =>
		(stageMatches(rule) ? 4 : 0) + (sectionMatches(rule) ? 3 : rule.section === "all" ? 2 : 0) + keywordMatches(rule);
	const rules = CHINA_JOB_KNOWLEDGE.rules
		.filter(
			(rule) =>
				!rule.hardConstraint &&
				applicable(rule) &&
				(rule.section === "all" || sectionMatches(rule) || stageMatches(rule) || keywordMatches(rule) > 0),
		)
		.sort(
			(a, b) =>
				rank(b) - rank(a) ||
				Number(a.evidenceLevel === "curated_practice") - Number(b.evidenceLevel === "curated_practice") ||
				a.id.localeCompare(b.id),
		)
		.slice(0, 8);
	return {
		version: CHINA_JOB_KNOWLEDGE.version,
		methodology: CHINA_JOB_KNOWLEDGE.methodology,
		role,
		audience,
		keywords: keywords.map((keyword) => ({ keyword, present: containsChinaKeyword(text, keyword) })),
		rules,
		hardConstraints: CHINA_JOB_KNOWLEDGE.rules.filter((rule) => rule.hardConstraint && applicable(rule)),
	};
}

export type {
	ChinaAudience,
	ChinaEvidenceLevel,
	ChinaReferenceOptions,
	ChinaReferenceReport,
	ChinaRole,
	ChinaRule,
} from "./types";
