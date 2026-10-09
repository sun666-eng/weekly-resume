import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type { ImportAnalysis, ResumeTextOptions } from "./import-language";
import { parsePeriod, parseSingleDate } from "@reactive-resume/resume/ats";
import { splitSkillKeywords } from "@reactive-resume/resume/skill-groups";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { generateId } from "@reactive-resume/utils/string";
import { applyResumeImportLocale, resolveResumeImportLocale } from "./import-language";
import { createPersonalInfoReader } from "./personal-info";
import { isSkillCategory, parseSkillLines } from "./skill-lines";

export type { ImportAnalysis, ResumeTextOptions } from "./import-language";
export type { ImportIssue } from "./personal-info";
export { detectResumeTextLocale, finalizeResumeImport } from "./import-language";

type SectionKey = SectionType | "summary" | "zh-internship" | "zh-campus";

type Segment = {
	key: SectionKey | null;
	title: string;
	lines: string[];
};

type RawEntry = {
	period: string;
	headerParts: string[];
	body: string[];
};

const MAX_HEADING_WORDS = 4;
const MAX_HEADING_LENGTH = 48;
const MAX_ENTRY_HEADER_WORDS = 8;
const MAX_LIST_ITEMS = 60;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

const SECTION_ALIASES: Readonly<Record<string, SectionKey>> = {
	summary: "summary",
	"professional summary": "summary",
	"career summary": "summary",
	profile: "summary",
	"personal profile": "summary",
	about: "summary",
	"about me": "summary",
	objective: "summary",
	"career objective": "summary",
	experience: "experience",
	"work experience": "experience",
	"professional experience": "experience",
	employment: "experience",
	"employment history": "experience",
	"work history": "experience",
	"career history": "experience",
	education: "education",
	"academic background": "education",
	"education and training": "education",
	qualifications: "education",
	skills: "skills",
	"technical skills": "skills",
	"key skills": "skills",
	"core competencies": "skills",
	competencies: "skills",
	expertise: "skills",
	projects: "projects",
	"personal projects": "projects",
	"selected projects": "projects",
	"side projects": "projects",
	languages: "languages",
	interests: "interests",
	hobbies: "interests",
	"hobbies and interests": "interests",
	awards: "awards",
	honors: "awards",
	honours: "awards",
	"awards and honors": "awards",
	achievements: "awards",
	certifications: "certifications",
	certificates: "certifications",
	licenses: "certifications",
	"licenses and certifications": "certifications",
	publications: "publications",
	papers: "publications",
	research: "publications",
	volunteer: "volunteer",
	volunteering: "volunteer",
	"volunteer experience": "volunteer",
	"community involvement": "volunteer",
	references: "references",
	profiles: "profiles",
	links: "profiles",
	"social profiles": "profiles",
	"contact information": "summary",
	"contact details": "summary",
	"contact info": "summary",
	"personal information": "summary",
	"personal details": "summary",
	"basic information": "summary",
	// Common Chinese resume headings (PDF/text imports).
	个人简介: "summary",
	个人资料: "summary",
	个人信息: "summary",
	基本信息: "summary",
	联系信息: "summary",
	联系方式: "summary",
	求职目标: "summary",
	求职意向: "summary",
	自我评价: "summary",
	个人评价: "summary",
	教育背景: "education",
	教育经历: "education",
	学习经历: "education",
	工作经历: "experience",
	工作经验: "experience",
	职业经历: "experience",
	项目经历: "projects",
	项目经验: "projects",
	个人项目: "projects",
	专业技能: "skills",
	技能特长: "skills",
	技能: "skills",
	语言能力: "languages",
	语言: "languages",
	兴趣爱好: "interests",
	业余爱好: "interests",
	获奖情况: "awards",
	获奖经历: "awards",
	荣誉奖项: "awards",
	奖项: "awards",
	证书: "certifications",
	证书信息: "certifications",
	资格证书: "certifications",
	技能证书: "certifications",
	科研经历: "publications",
	科研成果: "publications",
	发表论文: "publications",
	社会实践: "volunteer",
	志愿经历: "volunteer",
	志愿者经历: "volunteer",
	社交账号: "profiles",
	推荐人: "references",
	// The Chinese editor keeps internships and campus life as dedicated experience-style sections;
	// mapping them there preserves the original classification instead of merging them into
	// work experience or volunteer work.
	实习经历: "zh-internship",
	实习经验: "zh-internship",
	實習經歷: "zh-internship",
	校园经历: "zh-campus",
	校园实践: "zh-campus",
	社团经历: "zh-campus",
	校園經歷: "zh-campus",
	社團經歷: "zh-campus",
};

const BULLET_PATTERN = /^\s*(?:[-–—*]\s+|[•◦‣·]\s*)/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]*\w/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s,;|•·]+/gi;
const PHONE_CANDIDATE = /[+(]?\d[\d\s().+-]{5,}\d/g;
const DATE_LITERAL_PATTERN = /\b(?:(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2})\b/g;
const URL_TEST = /\b(?:https?:\/\/|www\.)\S+/i;
const HEADER_SCAN_LINES = 6;
const ENTRY_PREAMBLE_LOOKAHEAD = 4;
const PERIOD_CANDIDATE =
	/(?:(?:\d{4}[/.]\d{1,2}|(?:\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?\d{4}))\s*(?:[-–—~]|to|until|through)\s*(?:(?:\d{4}[/.]\d{1,2}|(?:\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?\d{4})|\p{L}+)/giu;
const STRONG_SEPARATOR = /\s*[|•·]\s*|\s{2,}|\s+[–—]\s+/;
const SENTENCE_END = /[.!?。！？]$/;
const TRAILING_DATES = [/(?:\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?(?:19|20)\d{2}$/u, /(?:\d{1,2}[/.])?(?:19|20)\d{2}$/];

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

const normalizeHeading = (line: string) =>
	line
		.replace(/[:：]\s*$/, "")
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();

function knownHeading(line: string): SectionKey | null {
	const normalized = normalizeHeading(line);
	if (!normalized || normalized.split(" ").length > MAX_HEADING_WORDS) return null;

	return SECTION_ALIASES[normalized] ?? null;
}

function looksLikeHeading(line: string): boolean {
	const trimmed = line.trim().replace(/[:：]$/, "");
	if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
	if (trimmed.split(/\s+/).length > MAX_HEADING_WORDS) return false;

	// Han characters pass the uppercase test vacuously, so a mixed content line such as
	// "C++/C#/音乐" would otherwise read as an English heading and swallow the line. Chinese
	// headings are recognized through the alias table instead.
	if (/\p{Script=Han}/u.test(trimmed)) return false;

	const letters = trimmed.replace(/[^\p{L}]/gu, "");
	if (letters.length < 3) return false;

	return letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

function looksLikeTitleCaseHeading(line: string): boolean {
	const trimmed = line.trim().replace(/[:：]$/, "");
	if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
	const words = trimmed.split(/\s+/);
	if (words.length > MAX_HEADING_WORDS) return false;

	return words.every((word) => {
		const letters = word.replace(/[^\p{L}]/gu, "");
		if (letters.length === 0) return false;
		// Same vacuous-uppercase problem as above: a Han word makes any casing test meaningless.
		if (/[^\p{ASCII}]/u.test(letters)) return false;
		return letters[0] === letters[0]?.toLocaleUpperCase() && letters.slice(1) === letters.slice(1).toLocaleLowerCase();
	});
}

/**
 * Whether a line could be the header of an entry rather than prose belonging to the previous one.
 *
 * Unbulleted descriptions are common, and without this test any narrative line that happens to sit
 * within the lookahead of the next role's dates would be promoted to a header, stealing the current
 * entry's description and seeding a garbage item from a sentence.
 */
function looksLikeEntryHeader(line: string): boolean {
	const trimmed = line.trim();
	if (SENTENCE_END.test(trimmed)) return false;
	if (/^View on\s/i.test(trimmed)) return false;
	if (/^(?:that|which|and|while|with|for|to|of|the|a|an|in|on|through|using|across)\s/.test(trimmed)) return false;
	if (STRONG_SEPARATOR.test(trimmed)) return true;

	return trimmed.split(/\s+/).length <= MAX_ENTRY_HEADER_WORDS;
}

function findPeriod(line: string): string {
	PERIOD_CANDIDATE.lastIndex = 0;

	for (const match of line.match(PERIOD_CANDIDATE) ?? []) {
		if (parsePeriod(match)) return match.trim();
		// A title word before a year is not a month. Retry the year range while keeping that word
		// available to the entry title ("Dialogue Framework 2021 - 2023").
		const yearRange = match.replace(/^[\p{L}.]+\s+(?=\d{4}\b)/u, "");
		if (yearRange !== match && parsePeriod(yearRange)) return yearRange.trim();
	}

	return "";
}

function findSingleDate(text: string): string {
	const trimmed = text.trim();

	for (const pattern of TRAILING_DATES) {
		const value = pattern.exec(trimmed)?.[0]?.trim();
		if (value && parseSingleDate(value)) return value;
	}

	return "";
}

function extractPhone(text: string): string {
	// PDF extractors often flatten birthday and contact columns into one line. Remove complete date
	// literals before scanning so `1995.05.05   +86 180 5252 5252` does not become one oversized
	// phone candidate and hide the real number that follows it.
	const contactText = text.replace(DATE_LITERAL_PATTERN, " ");
	for (const candidate of contactText.match(PHONE_CANDIDATE) ?? []) {
		const digits = candidate.replace(/\D/g, "");
		if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) continue;
		if (parsePeriod(candidate)) continue;

		return candidate.trim();
	}

	return "";
}

function isDateLine(line: string, allowSingleDate = true): boolean {
	if (findPeriod(line)) return true;
	// A section grouped without single dates reads a bare "2022" as text, so the lookahead has to
	// agree with it: otherwise that line closes an entry that groupEntries then never reopens.
	if (!allowSingleDate) return false;

	const bare = line.replace(BULLET_PATTERN, "").trim();
	return bare !== "" && parseSingleDate(bare) !== null;
}

function introducesEntry(lines: readonly string[], index: number, allowSingleDate = true): boolean {
	for (let offset = 1; offset <= ENTRY_PREAMBLE_LOOKAHEAD; offset++) {
		const line = lines[index + offset];
		if (line === undefined || BULLET_PATTERN.test(line)) return false;
		if (isDateLine(line, allowSingleDate)) return true;
	}

	return false;
}

function headerBoundary(lines: string[]): number {
	let boundary = 0;

	for (const [index, line] of lines.slice(0, HEADER_SCAN_LINES).entries()) {
		if (knownHeading(line)) break;
		if (EMAIL_PATTERN.test(line) || URL_TEST.test(line) || extractPhone(line)) boundary = index;
	}

	return boundary;
}

function splitHeaderParts(text: string): string[] {
	return text
		.split(STRONG_SEPARATOR)
		.map((part) => part.replace(/^[\s,;|•·–—-]+|[\s,;|•·–—-]+$/g, "").trim())
		.filter(Boolean);
}

function toHtml(lines: string[]): string {
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	if (cleaned.length === 0) return "";

	const bulleted = cleaned.filter((line) => BULLET_PATTERN.test(line));
	if (bulleted.length >= 2 && bulleted.length * 2 >= cleaned.length) {
		const items = cleaned.map((line) => `<li>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</li>`).join(""); // nosemgrep
		return `<ul>${items}</ul>`; // nosemgrep
	}

	return cleaned.map((line) => `<p>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</p>`).join(""); // nosemgrep
}

function splitList(lines: string[]): string[] {
	const values: string[] = [];

	for (const line of lines) {
		for (const piece of line.replace(BULLET_PATTERN, "").split(/[,;|•·]|\s{3,}/)) {
			const value = piece.trim();
			if (value) values.push(value);
		}
	}

	return [...new Set(values)].slice(0, MAX_LIST_ITEMS);
}

/**
 * Guarantees an entry has header text, because every section shape maps `headerParts[0]` onto a
 * field the resume schema requires to be non-empty. A section whose first line is a date opens an
 * entry with an empty header, and without this the whole import fails validation on that one item.
 */
function withHeaderText(entry: RawEntry): RawEntry {
	if (entry.headerParts.length > 0) return entry;

	const [first, ...rest] = entry.body;
	return { ...entry, headerParts: splitHeaderParts(first ?? ""), body: rest };
}

function groupEntries(lines: string[], allowSingleDate = false): RawEntry[] {
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	const entries: RawEntry[] = [];
	let current: RawEntry | null = null;

	const dateOf = (line: string) => {
		if (BULLET_PATTERN.test(line)) return "";

		const period = findPeriod(line);
		if (period) return period;

		return allowSingleDate ? findSingleDate(line) : "";
	};

	for (const [index, line] of cleaned.entries()) {
		const date = dateOf(line);

		if (date) {
			const remainder = splitHeaderParts(line.replace(date, " "));

			if (current && !current.period) {
				current.period = date;
				current.headerParts.push(...remainder);
				continue;
			}

			if (current) entries.push(current);
			current = { period: date, headerParts: remainder, body: [] };
			continue;
		}

		if (!current) {
			current = { period: "", headerParts: splitHeaderParts(line), body: [] };
			continue;
		}

		const isBullet = BULLET_PATTERN.test(line);
		const issuerAfterDate =
			allowSingleDate &&
			current.period &&
			current.body.length === 0 &&
			/\b(?:Technologies|University|Institute|Games|Association|Academy)\b/.test(line);
		const nearbyDate = [1, 2].some((offset) => isDateLine(cleaned[index + offset] ?? "", allowSingleDate));
		const continuation = Boolean(
			current.period &&
				current.body.length > 0 &&
				/^[a-z][a-z'-]*[.,:]?\s/.test(line) &&
				!STRONG_SEPARATOR.test(line) &&
				!nearbyDate,
		);
		const leadsToDate =
			!isBullet &&
			!issuerAfterDate &&
			!continuation &&
			looksLikeEntryHeader(line) &&
			introducesEntry(cleaned, index, allowSingleDate);

		if (leadsToDate && !current.period && current.body.length === 0) {
			current.headerParts.push(...splitHeaderParts(line));
			continue;
		}

		if (leadsToDate) {
			entries.push(current);
			current = { period: "", headerParts: splitHeaderParts(line), body: [] };
			continue;
		}

		current.body.push(line);
	}

	if (current) entries.push(current);

	return entries.map(withHeaderText).filter((entry) => entry.headerParts.length > 0);
}

function entryDescription(entry: RawEntry, usedParts: number): string {
	const leftover = entry.headerParts.slice(usedParts);
	return toHtml([...leftover, ...entry.body]);
}

const baseItem = () => ({ id: generateId(), hidden: false });

const emptyWebsite = { url: "", label: "", inlineLink: false };

const isEntryLocation = (part: string) =>
	/^(?:[\p{Script=Han}]{2,8}(?:省|市|区|县)|北京|上海|天津|重庆|广州|深圳|杭州|南京|成都|武汉|西安|Remote|Hybrid|远程)$|,\s*\p{L}/iu.test(
		part,
	);

function experienceFields(entry: RawEntry) {
	const parts = entry.headerParts.slice(1);
	const locationIndex = parts.findIndex((part, index) => index < 2 && isEntryLocation(part));
	if (locationIndex < 0)
		return { position: parts[0] ?? "", location: parts[1] ?? "", description: entryDescription(entry, 3) };
	const roleIndex = parts.findIndex((_, index) => index !== locationIndex);
	return {
		position: parts[roleIndex] ?? "",
		location: parts[locationIndex] ?? "",
		description: toHtml([...parts.filter((_, index) => index !== roleIndex && index !== locationIndex), ...entry.body]),
	};
}

function educationFields(entry: RawEntry) {
	const parts = entry.headerParts.slice(1);
	const degreeIndex = parts.findIndex((part) =>
		/^(?:(?:本科|学士|大专|专科|硕士|博士|高中|中专|研究生)(?:学位|学历)?$|(?:Bachelor|Master|Doctor|BSc|MSc|BA|BS|MA|MS|PhD)\b)/i.test(
			part,
		),
	);
	if (degreeIndex < 0)
		return { degree: parts[0] ?? "", area: "", location: parts[1] ?? "", description: entryDescription(entry, 3) };
	const remaining = parts.filter((_, index) => index !== degreeIndex);
	const locationIndex = remaining.findIndex(isEntryLocation);
	const gradeIndex = remaining.findIndex((part) =>
		/^(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*GPA|GPA\s*[:：]?\s*\d+(?:\.\d+)?)$/i.test(part),
	);
	const majorIndex = remaining.findIndex(
		(part, index) =>
			index !== locationIndex &&
			index !== gradeIndex &&
			/(?:专业|工程|科学|技术|学|设计|管理|艺术|教育|语言|数学|物理|化学|英语|Science|Engineering|Mathematics|Arts|Design|Management)$/i.test(
				part,
			),
	);
	return {
		degree: parts[degreeIndex] ?? "",
		area: remaining[majorIndex] ?? "",
		grade: remaining[gradeIndex] ?? "",
		location: remaining[locationIndex] ?? "",
		description: toHtml([
			...remaining.filter((_, index) => index !== majorIndex && index !== locationIndex && index !== gradeIndex),
			...entry.body,
		]),
	};
}

function buildSectionItems(key: SectionKey, lines: string[]): unknown[] {
	if (key === "skills") {
		return parseSkillLines(lines).map((group) => ({
			...baseItem(),
			icon: "",
			iconColor: "",
			proficiency: "",
			level: 0,
			...group,
		}));
	}
	if (key === "interests") {
		return splitList(lines).map((name) => ({
			...baseItem(),
			icon: "",
			iconColor: "",
			name,
			keywords: [],
		}));
	}

	if (key === "languages") {
		const languageLines = lines.map((line) => line.replace(BULLET_PATTERN, "").trim()).filter(Boolean);
		return languageLines.flatMap((line, index) => {
			const fluency = /^(?:Native|Fluent|Conversational|Professional|Intermediate|Beginner|母语|流利|熟练)$/i;
			if (index > 0 && fluency.test(line) && !fluency.test(languageLines[index - 1] ?? "")) return [];
			const match = /^(.+?)\s*[([–—-]\s*(.+?)\s*[)\]]?$/.exec(line);
			const next = languageLines[index + 1] ?? "";
			return {
				...baseItem(),
				language: (match?.[1] ?? line).trim(),
				fluency: (match?.[2] ?? (fluency.test(next) ? next : "")).trim(),
				level: 0,
			};
		});
	}

	if (key === "profiles") {
		return lines
			.map((line) => line.replace(BULLET_PATTERN, "").trim())
			.filter(Boolean)
			.map((line) => {
				const url = line.match(URL_PATTERN)?.[0] ?? "";
				const network = splitHeaderParts(line.replace(url, " "))[0] ?? line;
				return {
					...baseItem(),
					icon: "",
					iconColor: "",
					network,
					username: "",
					website: { url, label: "", inlineLink: false },
				};
			});
	}

	const dated = key === "awards" || key === "certifications" || key === "publications";
	const entries = groupEntries(lines, dated);

	if (key === "experience") {
		return entries.map((entry) => ({
			...baseItem(),
			company: entry.headerParts[0] ?? "",
			period: entry.period,
			website: emptyWebsite,
			...experienceFields(entry),
			roles: [],
		}));
	}

	if (key === "education") {
		return entries.map((entry) => ({
			...baseItem(),
			school: entry.headerParts[0] ?? "",
			grade: "",
			period: entry.period,
			website: emptyWebsite,
			...educationFields(entry),
		}));
	}

	if (key === "projects") {
		return entries.map((entry) => ({
			...baseItem(),
			name: entry.headerParts[0] ?? "",
			period: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 1),
		}));
	}

	if (key === "volunteer") {
		return entries.map((entry) => ({
			...baseItem(),
			organization: entry.headerParts[0] ?? "",
			location: entry.headerParts[1] ?? "",
			period: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	if (key === "awards") {
		return entries.map((entry) => ({
			...baseItem(),
			title: entry.headerParts[0] ?? "",
			awarder: entry.headerParts[1] ?? "",
			date: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	if (key === "certifications") {
		return entries.map((entry) => {
			const wrappedTitle = /[:：]$/.test(entry.headerParts[0] ?? "");
			const title = wrappedTitle ? entry.headerParts.join(" ") : (entry.headerParts[0] ?? "");
			const explicitIssuer = wrappedTitle ? "" : entry.headerParts[1];
			const firstBodyLine = entry.body[0] ?? "";
			const issuerInBody =
				!explicitIssuer &&
				!SENTENCE_END.test(firstBodyLine) &&
				firstBodyLine.split(/\s+/).length <= 10 &&
				/\b(?:Technologies|University|Institute|Games|Association|Academy)\b/.test(firstBodyLine);
			const issuer = explicitIssuer || (issuerInBody ? firstBodyLine : "");
			const remaining = issuerInBody ? { ...entry, body: entry.body.slice(1) } : entry;
			return {
				...baseItem(),
				title,
				issuer,
				date: entry.period,
				website: emptyWebsite,
				description: entryDescription(remaining, wrappedTitle ? entry.headerParts.length : 2),
			};
		});
	}

	if (key === "publications") {
		return entries.map((entry) => ({
			...baseItem(),
			title: entry.headerParts[0] ?? "",
			publisher: entry.headerParts[1] ?? "",
			date: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	return entries.map((entry) => ({
		...baseItem(),
		name: entry.headerParts[0] ?? "",
		position: entry.headerParts[1] ?? "",
		phone: "",
		website: emptyWebsite,
		description: entryDescription(entry, 2),
	}));
}

function segment(lines: string[]): { header: string[]; segments: Segment[] } {
	const records = lines
		.map((line, index) => ({ line: line.trim(), precededByBlank: index > 0 && !lines[index - 1]?.trim() }))
		.filter((record) => record.line);
	const cleaned = records.map((record) => record.line);
	const boundary = headerBoundary(cleaned);
	const header: string[] = [];
	const segments: Segment[] = [];
	let current: Segment | null = null;

	for (const [index, { line, precededByBlank }] of records.entries()) {
		const key = knownHeading(line);
		const isolatedTitleCase = precededByBlank && looksLikeTitleCaseHeading(line);
		// Inside a skills section an uppercase or mixed-technology line is usually a skill entry, not
		// the start of a new section. A run of consecutive uppercase lines is read as skill content,
		// while a single standalone uppercase line (like SPEAKING below a skills block) still opens a
		// section. A recognized category word (Languages/Tools/…) followed by a keyword list is held
		// as a skill category even though it collides with a section alias; a real languages section
		// after skills starts fluency entries ("English (Native)"), not a comma list, so it still wins.
		const holdsInSkills =
			current?.key === "skills" && isSkillCategory(line) && splitSkillKeywords(cleaned[index + 1] ?? "").length >= 2;
		const uppercaseRun = looksLikeHeading(cleaned[index - 1] ?? "") || looksLikeHeading(cleaned[index + 1] ?? "");
		const unknown =
			key === null &&
			!holdsInSkills &&
			!(current?.key === "skills" && !(isolatedTitleCase || (looksLikeHeading(line) && !uppercaseRun))) &&
			index > boundary &&
			(looksLikeHeading(line) || isolatedTitleCase) &&
			(current === null || isolatedTitleCase || !introducesEntry(cleaned, index));

		if ((key !== null || unknown) && !holdsInSkills) {
			if (current) segments.push(current);
			current = { key, title: line.replace(/[:：]\s*$/, "").trim(), lines: [] };
			continue;
		}

		if (current) current.lines.push(line);
		else header.push(line);
	}

	if (current) segments.push(current);

	return { header, segments };
}

const PERSONAL_INFO_TITLES = new Set([
	"个人信息",
	"个人资料",
	"基本信息",
	"联系信息",
	"联系方式",
	"求职意向",
	"求职目标",
	"personal information",
	"personal details",
	"basic information",
	"contact information",
	"contact details",
	"contact info",
]);

const isPersonalInfoHeading = (title: string) => PERSONAL_INFO_TITLES.has(normalizeHeading(title));

/** Shared with PDF reading-order detection; uses the importer's exact section aliases. */
export function isKnownResumeHeading(line: string): boolean {
	return knownHeading(line) !== null;
}

export function parseResumeTextWithDiagnostics(text: string, options: ResumeTextOptions = {}): ImportAnalysis {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const { header, segments } = segment(lines);
	const data: ResumeData = structuredClone(defaultResumeData);
	const language = resolveResumeImportLocale(text, options);
	applyResumeImportLocale(data, language.locale);
	const personal = createPersonalInfoReader(data.basics, extractPhone);
	personal.read(header, true);
	const order: string[] = [];

	for (const item of segments) {
		if (item.lines.length === 0) continue;

		if (item.key === "summary") {
			if (isPersonalInfoHeading(item.title)) {
				const objective = normalizeHeading(item.title) === "求职意向" || normalizeHeading(item.title) === "求职目标";
				personal.read(item.lines, false, objective);
				continue;
			}

			data.summary.title = item.title;
			const content = toHtml(item.lines);
			data.summary.content = data.summary.content ? `${data.summary.content}${content}` : content;
			if (!order.includes("summary")) order.push("summary");
			continue;
		}

		if (item.key === "zh-internship" || item.key === "zh-campus") {
			const items = buildSectionItems("experience", item.lines);
			if (items.length === 0) continue;

			let custom = data.customSections.find((section) => section.id === item.key);
			if (!custom) {
				custom = {
					id: item.key,
					type: "experience",
					title: item.title,
					icon: "",
					columns: 1,
					hidden: false,
					keepTogether: false,
					startOnNewPage: false,
					items: [],
				};
				data.customSections.push(custom);
				order.push(item.key);
			}
			custom.items.push(...(items as typeof custom.items));
			continue;
		}

		if (item.key === null) {
			const id = generateId();
			data.customSections.push({
				id,
				type: "summary",
				title: item.title,
				icon: "",
				columns: 1,
				hidden: false,
				keepTogether: false,
				startOnNewPage: false,
				items: [{ id: generateId(), hidden: false, content: toHtml(item.lines) }],
			});
			order.push(id);
			continue;
		}

		const items = buildSectionItems(item.key, item.lines);
		if (items.length === 0) continue;

		const section = data.sections[item.key];
		if (!order.includes(item.key)) section.title = item.title;
		section.items = [...section.items, ...items] as typeof section.items;
		if (!order.includes(item.key)) order.push(item.key);
	}

	const unconsumed = toHtml(personal.leftovers);
	if (unconsumed) {
		data.summary.content += unconsumed;
		if (!order.includes("summary")) order.unshift("summary");
	}
	data.metadata.layout.pages = [{ fullWidth: true, main: order, sidebar: [] }];
	const issues = [...personal.issues, ...language.issues];
	if (!data.basics.name) issues.push({ code: "missing-name", field: "name", raw: "" });
	return { data: parseResumeData(data), issues, detectedLocale: language.detectedLocale };
}

export function parseResumeText(text: string, options?: ResumeTextOptions): ResumeData {
	return parseResumeTextWithDiagnostics(text, options).data;
}
