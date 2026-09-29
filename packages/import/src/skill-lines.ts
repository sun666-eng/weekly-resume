import { splitSkillKeywords as splitKeywords } from "@reactive-resume/resume/skill-groups";

type SkillGroup = { name: string; keywords: string[] };

const bullet = /^\s*[•●▪◦*-]\s*/u;
// Only recognizable category labels establish a group without a colon. Never
// infer categories from technology names such as Java or Docker alone. The
// prefix may be empty so suffix-only labels such as 工具 or 数据库 still count;
// the next-line guard below keeps standalone stray words from opening a group.
const category =
	/^(?:[\p{Script=Han}与及和/&\s]{0,20}(?:基础|工具|通信|语言|技能|开发|运维|数据库)|编程语言|专业技能|programming languages|languages|frameworks|databases|tools|technical skills|development tools)$/iu;

export function isSkillCategory(line: string): boolean {
	return category.test(
		line
			.replace(bullet, "")
			.replace(/[:：]\s*$/u, "")
			.trim(),
	);
}

export function parseSkillLines(lines: string[]): SkillGroup[] {
	const result: SkillGroup[] = [];
	let active: SkillGroup | undefined;
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	for (let index = 0; index < cleaned.length; index++) {
		const raw = cleaned[index];
		if (!raw) continue;
		const line = raw.replace(bullet, "").trim();
		// A URL or C++ namespace is not a category delimiter.
		const labeled = /^(?!.*:\/\/)([^:：]{1,32})[:：](?!:)(.*)$/u.exec(line);
		if (labeled?.[1] && labeled[2] !== undefined) {
			active = { name: labeled[1].trim(), keywords: splitKeywords(labeled[2]) };
			result.push(active);
			continue;
		}
		const next = cleaned[index + 1];
		if (category.test(line) && next && !isSkillCategory(next)) {
			active = { name: line, keywords: [] };
			result.push(active);
			continue;
		}
		const values = splitKeywords(line);
		if (active) active.keywords.push(...values);
		else {
			active = undefined;
			result.push(...values.map((name) => ({ name, keywords: [] })));
		}
	}
	return result;
}
