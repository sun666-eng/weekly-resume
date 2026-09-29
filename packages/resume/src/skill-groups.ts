import type { SkillItem } from "@reactive-resume/schema/resume/data";

/** Split pasted lists without cutting punctuation inside skill descriptions. */
export function splitSkillKeywords(text: string): string[] {
	const parts: string[] = [];
	let current = "";
	let depth = 0;
	for (const char of text) {
		if ("(（[【".includes(char)) depth++;
		if (")）]】".includes(char)) depth = Math.max(0, depth - 1);
		if (depth === 0 && /[,，、;；|•\r\n]/u.test(char)) {
			if (current.trim()) parts.push(current.trim());
			current = "";
		} else current += char;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/** Plain visible entries only: merging must not discard ratings or nested groups. */
export function canMergeSkill(item: SkillItem): boolean {
	return (
		!item.hidden &&
		item.name.trim().length > 0 &&
		!item.proficiency.trim() &&
		item.level === 0 &&
		item.keywords.length === 0 &&
		(!item.icon || item.icon === "acorn") &&
		!item.iconColor
	);
}

/** Returns a new array; IDs, ordering and unrelated entries are retained. */
export function mergeSkillGroup(items: SkillItem[], ids: string[], headingId: string): SkillItem[] | null {
	const selected = new Set(ids);
	if (selected.size < 2 || !selected.has(headingId)) return null;
	const members = items.filter((item) => selected.has(item.id));
	if (members.length !== selected.size || !members.every(canMergeSkill)) return null;
	const heading = members.find((item) => item.id === headingId);
	if (!heading) return null;
	const group = { ...heading, keywords: members.filter((item) => item.id !== headingId).map((item) => item.name) };
	return items.flatMap((item) => (item.id === headingId ? [group] : selected.has(item.id) ? [] : [item]));
}
