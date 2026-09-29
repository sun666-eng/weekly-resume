import type { ResumeData } from "./data";

export const CHINESE_INTERNSHIP_SECTION_ID = "zh-internship";
export const CHINESE_CAMPUS_SECTION_ID = "zh-campus";

export const GENDER_VALUES = ["male", "female", "other", "undisclosed"] as const;
export const POLITICAL_STATUS_VALUES = [
	"party-member",
	"league-member",
	"masses",
	"democratic-party",
	"other",
] as const;

export type GenderValue = (typeof GENDER_VALUES)[number];
export type PoliticalStatusValue = (typeof POLITICAL_STATUS_VALUES)[number];

const OPTIONAL_JSON_KEYS = [
	"gender",
	"age",
	"blog",
	"github",
	"politicalStatus",
	"politicalStatusOther",
	"address",
	"schoolTier",
	"department",
	"employmentType",
	"role",
] as const;

export const optionalResumeJsonKeys: ReadonlySet<string> = new Set(OPTIONAL_JSON_KEYS);

type DisplayGender = Exclude<GenderValue, "undisclosed">;

type LabelSet = {
	gender: Record<DisplayGender, string>;
	political: Record<Exclude<PoliticalStatusValue, "other">, string>;
	age: (value: string) => string;
	ongoing: string;
	studying: string;
};

const simplifiedLabels: LabelSet = {
	gender: { male: "男", female: "女", other: "其他" },
	political: {
		"party-member": "中共党员",
		"league-member": "共青团员",
		masses: "群众",
		"democratic-party": "民主党派",
	},
	age: (value) => `${value}岁`,
	ongoing: "至今",
	studying: "在读",
};

const traditionalLabels: LabelSet = {
	gender: { male: "男", female: "女", other: "其他" },
	political: {
		"party-member": "中共黨員",
		"league-member": "共青團員",
		masses: "群眾",
		"democratic-party": "民主黨派",
	},
	age: (value) => `${value}歲`,
	ongoing: "至今",
	studying: "在讀",
};

const englishLabels: LabelSet = {
	gender: { male: "Male", female: "Female", other: "Other" },
	political: {
		"party-member": "CPC member",
		"league-member": "Communist Youth League member",
		masses: "Masses",
		"democratic-party": "Democratic parties",
	},
	age: (value) => `Age ${value}`,
	ongoing: "Present",
	studying: "Studying",
};

export type BasicsContactName =
	| "email"
	| "phone"
	| "gender"
	| "age"
	| "location"
	| "address"
	| "political"
	| "blog"
	| "github"
	| "website";

export type BasicsContactEntry = {
	name: BasicsContactName;
	text: string;
	href?: string;
};

type BasicsLike = {
	email?: string | undefined;
	phone?: string | undefined;
	location?: string | undefined;
	address?: string | undefined;
	gender?: string | undefined;
	age?: string | undefined;
	politicalStatus?: string | undefined;
	politicalStatusOther?: string | undefined;
	blog?: { url?: string | undefined; label?: string | undefined } | undefined;
	github?: { url?: string | undefined; label?: string | undefined } | undefined;
	website?: { url?: string | undefined; label?: string | undefined } | undefined;
};

type ProfileLike = {
	network?: string;
	website?: { url?: string } | null;
};

export type PeriodRangeMode = "date" | "ongoing" | "studying";

export type PeriodRange = {
	start: string;
	end: string;
	mode: PeriodRangeMode;
};

const PRESENT_TOKENS: Record<string, PeriodRangeMode> = {
	至今: "ongoing",
	present: "ongoing",
	current: "ongoing",
	now: "ongoing",
	在读: "studying",
	在讀: "studying",
	studying: "studying",
};

export function isChineseResumeLocale(locale: string | undefined | null): boolean {
	return typeof locale === "string" && locale.trim().toLowerCase().startsWith("zh");
}

export function isTraditionalChineseLocale(locale: string | undefined | null): boolean {
	if (!locale) return false;
	const value = locale.trim().toLowerCase();
	return value.startsWith("zh-tw") || value.startsWith("zh-hk") || value.startsWith("zh-mo") || value.startsWith("zh-hant");
}

function labelsFor(locale: string | undefined): LabelSet {
	if (isTraditionalChineseLocale(locale)) return traditionalLabels;
	if (isChineseResumeLocale(locale)) return simplifiedLabels;
	return englishLabels;
}

export function safeHttpUrl(value: string | undefined | null): string | null {
	const input = value?.trim() ?? "";
	if (!input) return null;

	try {
		const url = new URL(input);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function sameHttpUrl(left: string | undefined | null, right: string | undefined | null): boolean {
	const a = safeHttpUrl(left);
	const b = safeHttpUrl(right);
	if (a && b) return a.replace(/\/$/, "") === b.replace(/\/$/, "");

	const rawLeft = left?.trim().toLowerCase() ?? "";
	const rawRight = right?.trim().toLowerCase() ?? "";
	return rawLeft.length > 0 && rawLeft === rawRight;
}

export function parseOptionalAge(value: string | undefined | null): string | null {
	const text = value?.trim() ?? "";
	if (!/^[1-9]\d{0,2}$/.test(text)) return null;
	const age = Number(text);
	if (age < 1 || age > 120) return null;
	return String(age);
}

export function genderLabel(value: string | undefined | null, locale: string | undefined): string | null {
	const text = value?.trim() ?? "";
	// "undisclosed" is the saved "prefer not to say" value, including resumes saved before "other" existed.
	if (!text || text === "undisclosed") return null;
	const known = labelsFor(locale).gender[text as DisplayGender];
	return known ?? text;
}

export function politicalStatusLabel(
	value: string | undefined | null,
	other: string | undefined | null,
	locale: string | undefined,
): string | null {
	const text = value?.trim() ?? "";
	if (!text) return null;
	if (text === "other") return other?.trim() || null;
	const known = labelsFor(locale).political[text as Exclude<PoliticalStatusValue, "other">];
	return known ?? text;
}

export function ageLabel(value: string | undefined | null, locale: string | undefined): string | null {
	const age = parseOptionalAge(value);
	if (!age) return null;
	return labelsFor(locale).age(age);
}

function linkEntry(
	name: "blog" | "github" | "website",
	website: { url?: string | undefined; label?: string | undefined } | undefined,
	fallbackLabel: string,
): BasicsContactEntry | null {
	const rawUrl = website?.url?.trim() ?? "";
	if (!rawUrl) return null;
	const href = safeHttpUrl(rawUrl);
	const text = website?.label?.trim() || fallbackLabel || rawUrl;
	if (!href) return { name, text: rawUrl };
	return { name, text, href };
}

/**
 * Contact lines that have a value. Empty optional fields are omitted.
 * A website identical to the personal blog is omitted so the link is not printed twice.
 */
export function listBasicsContactEntries(basics: BasicsLike, locale: string | undefined): BasicsContactEntry[] {
	const entries: BasicsContactEntry[] = [];
	const email = basics.email?.trim() ?? "";
	const phone = basics.phone?.trim() ?? "";
	const location = basics.location?.trim() ?? "";
	const address = basics.address?.trim() ?? "";
	const gender = genderLabel(basics.gender, locale);
	const age = ageLabel(basics.age, locale);
	const political = politicalStatusLabel(basics.politicalStatus, basics.politicalStatusOther, locale);
	const blogLabel = isChineseResumeLocale(locale) ? (isTraditionalChineseLocale(locale) ? "個人博客" : "个人博客") : "Blog";
	const blog = linkEntry("blog", basics.blog, blogLabel);
	const github = linkEntry("github", basics.github, "GitHub");
	const website = linkEntry("website", basics.website, "");

	if (email) entries.push({ name: "email", text: email, href: `mailto:${email}` });
	if (phone) entries.push({ name: "phone", text: phone, href: `tel:${phone}` });
	if (gender) entries.push({ name: "gender", text: gender });
	if (age) entries.push({ name: "age", text: age });
	if (location) entries.push({ name: "location", text: location });
	if (address) entries.push({ name: "address", text: address });
	if (political) entries.push({ name: "political", text: political });
	if (blog) entries.push(blog);
	if (github) entries.push(github);
	if (website && !(blog?.href && website.href && sameHttpUrl(blog.href, website.href))) entries.push(website);

	return entries;
}

export function isDuplicateGithubProfile(profile: ProfileLike, basics: Pick<BasicsLike, "github">): boolean {
	const github = basics.github?.url?.trim() ?? "";
	if (!github) return false;
	if (!profile.network || !/^github$/i.test(profile.network.trim())) return false;
	return sameHttpUrl(profile.website?.url, github);
}

export function omitDuplicateGithubProfiles<T>(items: T[], basics: Pick<BasicsLike, "github">): T[] {
	if (!basics.github?.url?.trim()) return items;
	return items.filter((item) => !isDuplicateGithubProfile(item as ProfileLike, basics));
}

const MONTH_PATTERN = /^(\d{4})[./-](\d{1,2})$/;
const RANGE_PATTERN = /^(.+?)\s*[–—-]\s*(.+)$/;

function toMonthValue(value: string): string | null {
	const match = value.trim().match(MONTH_PATTERN);
	if (!match) return null;
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return `${match[1]}-${String(month).padStart(2, "0")}`;
}

/**
 * Reads a period only when both ends are unambiguous.
 * Returns null for free-form text so callers can keep the original string.
 */
export function parsePeriodRange(period: string | undefined | null): PeriodRange | null {
	const match = period?.trim().match(RANGE_PATTERN);
	if (!match) return null;
	const start = toMonthValue(match[1] ?? "");
	if (!start) return null;
	const endText = (match[2] ?? "").trim();
	const mode = PRESENT_TOKENS[endText.toLowerCase()] ?? PRESENT_TOKENS[endText];
	if (mode) return { start, end: "", mode };
	const end = toMonthValue(endText);
	if (!end) return null;
	return { start, end, mode: "date" };
}

export function formatPeriodRange(
	start: string,
	end: string,
	mode: PeriodRangeMode,
	locale: string | undefined,
): string | null {
	if (!/^\d{4}-\d{2}$/.test(start)) return null;
	const startText = start.replace("-", ".");
	const labels = labelsFor(locale);
	if (mode === "ongoing") return `${startText} - ${labels.ongoing}`;
	if (mode === "studying") return `${startText} - ${labels.studying}`;
	if (!/^\d{4}-\d{2}$/.test(end)) return null;
	return `${startText} - ${end.replace("-", ".")}`;
}

export type ChineseSectionTitles = {
	summary: string;
	education: string;
	skills: string;
	experience: string;
	projects: string;
	awards: string;
	certifications: string;
	publications: string;
	internship: string;
	campus: string;
	profiles: string;
	languages: string;
	interests: string;
	volunteer: string;
	references: string;
};

const simplifiedSectionTitles: ChineseSectionTitles = {
	summary: "个人评价",
	education: "教育背景",
	skills: "专业技能",
	experience: "工作经历",
	projects: "项目经历",
	awards: "获奖经历",
	certifications: "证书信息",
	publications: "科研成果",
	internship: "实习经历",
	campus: "校园经历",
	profiles: "社交资料",
	languages: "语言能力",
	interests: "兴趣爱好",
	volunteer: "志愿经历",
	references: "推荐人",
};

const traditionalSectionTitles: ChineseSectionTitles = {
	summary: "個人評價",
	education: "教育背景",
	skills: "專業技能",
	experience: "工作經歷",
	projects: "項目經歷",
	awards: "獲獎經歷",
	certifications: "證書信息",
	publications: "科研成果",
	internship: "實習經歷",
	campus: "校園經歷",
	profiles: "社交資料",
	languages: "語言能力",
	interests: "興趣愛好",
	volunteer: "志願經歷",
	references: "推薦人",
};

export function chineseSectionTitles(locale: string | undefined): ChineseSectionTitles {
	return isTraditionalChineseLocale(locale) ? traditionalSectionTitles : simplifiedSectionTitles;
}

export function chineseResumeFontFamily(locale: string | undefined): string {
	if (isTraditionalChineseLocale(locale)) {
		return locale?.toLowerCase().startsWith("zh-hk") || locale?.toLowerCase().startsWith("zh-mo")
			? "Noto Sans HK"
			: "Noto Sans TC";
	}
	return "Noto Sans SC";
}

const emptyWebsite = { url: "", label: "" };

function ensureItemText(item: object, key: string) {
	const record = item as Record<string, unknown>;
	if (typeof record[key] !== "string") record[key] = "";
}

/** Fills omitted Chinese-resume fields without replacing values that are already stored. */
export function ensureCnFieldDefaults(data: ResumeData): ResumeData {
	const basics = data.basics as ResumeData["basics"] & Record<string, unknown>;
	if (typeof basics.gender !== "string") basics.gender = "";
	if (typeof basics.age !== "string") basics.age = "";
	if (typeof basics.politicalStatus !== "string") basics.politicalStatus = "";
	if (typeof basics.politicalStatusOther !== "string") basics.politicalStatusOther = "";
	if (typeof basics.address !== "string") basics.address = "";
	if (!basics.blog || typeof basics.blog !== "object") basics.blog = { ...emptyWebsite };
	if (typeof basics.blog.url !== "string") basics.blog.url = "";
	if (typeof basics.blog.label !== "string") basics.blog.label = "";
	if (!basics.github || typeof basics.github !== "object") basics.github = { ...emptyWebsite };
	if (typeof basics.github.url !== "string") basics.github.url = "";
	if (typeof basics.github.label !== "string") basics.github.label = "";

	for (const item of data.sections.education.items) ensureItemText(item, "schoolTier");
	for (const item of data.sections.experience.items) {
		ensureItemText(item, "department");
		ensureItemText(item, "employmentType");
	}
	for (const item of data.sections.projects.items) ensureItemText(item, "role");

	for (const section of data.customSections) {
		if (section.type === "education") {
			for (const item of section.items) ensureItemText(item, "schoolTier");
		} else if (section.type === "experience") {
			for (const item of section.items) {
				ensureItemText(item, "department");
				ensureItemText(item, "employmentType");
			}
		} else if (section.type === "projects") {
			for (const item of section.items) ensureItemText(item, "role");
		}
	}

	return data;
}
