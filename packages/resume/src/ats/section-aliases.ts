import type { CustomSectionType } from "@reactive-resume/schema/resume/data";

/**
 * Conventional English headings the live builder lint accepts without complaint.
 * Kept deliberately narrow: this set decides whether NON_STANDARD_SECTION_TITLE fires.
 */
export const SECTION_TITLE_ALIASES: Partial<Record<CustomSectionType, ReadonlySet<string>>> = {
	summary: new Set([
		"summary",
		"professional summary",
		"profile",
		"about",
		"about me",
		"objective",
		"career objective",
		"自我评价",
		"个人评价",
		"个人简介",
		"关于我",
		"简介",
	]),
	experience: new Set([
		"experience",
		"work experience",
		"professional experience",
		"employment",
		"employment history",
		"work history",
		"career history",
		// Internship/campus groups are custom sections whose stored type is `experience`.
		"工作经历",
		"工作经验",
		"职业经历",
		"任职经历",
		"实践经历",
		"实习经历",
		"实习经验",
		"校园经历",
		"校园实践",
	]),
	education: new Set([
		"education",
		"academic background",
		"education & training",
		"educational background",
		"教育背景",
		"教育经历",
		"学习经历",
		"教育信息",
		"学术背景",
	]),
	projects: new Set(["projects", "personal projects", "selected projects", "side projects", "项目经历", "项目经验", "个人项目", "主要项目"]),
	skills: new Set([
		"skills",
		"technical skills",
		"core competencies",
		"competencies",
		"skills & expertise",
		"专业技能",
		"技能特长",
		"核心技能",
		"技术栈",
	]),
	languages: new Set(["languages", "语言能力", "语言技能"]),
	interests: new Set(["interests", "hobbies", "hobbies & interests", "兴趣爱好", "兴趣", "爱好"]),
	awards: new Set(["awards", "honors", "awards & honors", "achievements", "获奖经历", "获奖情况", "荣誉奖项", "荣誉"]),
	certifications: new Set([
		"certifications",
		"certificates",
		"licenses",
		"licenses & certifications",
		"证书信息",
		"资格证书",
		"专业证书",
		"证书",
	]),
	publications: new Set(["publications", "papers", "research", "科研成果", "学术成果", "发表论文"]),
	volunteer: new Set(["volunteer", "volunteering", "volunteer experience", "community involvement", "志愿经历", "志愿者经历", "志愿服务"]),
	references: new Set(["references"]),
	profiles: new Set(["profiles", "links", "social profiles"]),
};

/**
 * Additional headings seen in the wild that the PDF checker must still recognise as a section.
 * These are recall-oriented: a resume that writes "Career Summary" has a summary section, even
 * though the builder lint would still nudge the author toward a more conventional title.
 */
const EXTRA_PDF_HEADING_ALIASES: Partial<Record<CustomSectionType, readonly string[]>> = {
	summary: [
		"career objective",
		"career summary",
		"executive summary",
		"personal statement",
		"professional profile",
		"summary of qualifications",
		"qualifications summary",
		"overview",
		"professional overview",
		"who i am",
	],
	experience: [
		"relevant experience",
		"professional background",
		"work history & experience",
		"industry experience",
		"positions held",
		"roles",
		"experience & achievements",
		"work",
		"employment experience",
		"relevant work experience",
	],
	education: [
		"academic qualifications",
		"academics",
		"education and training",
		"qualifications",
		"degrees",
		"academic history",
		"schooling",
	],
	projects: ["key projects", "notable projects", "portfolio", "project experience", "academic projects"],
	skills: [
		"technical proficiencies",
		"areas of expertise",
		"key skills",
		"skills summary",
		"tools & technologies",
		"technologies",
		"tech stack",
		"proficiencies",
		"expertise",
		"strengths",
	],
	languages: ["language skills", "spoken languages", "languages known"],
	interests: ["activities", "personal interests", "outside of work"],
	awards: ["honours", "awards and honors", "recognition", "accomplishments", "achievements & awards"],
	certifications: [
		"certifications & licenses",
		"professional certifications",
		"credentials",
		"licenses and certifications",
		"courses & certifications",
	],
	publications: ["publications & talks", "talks", "presentations", "conference papers", "patents"],
	volunteer: ["volunteer work", "community service", "voluntary experience", "community"],
	references: ["references available upon request", "referees"],
	profiles: ["contact", "contact information", "contact details", "online profiles", "find me online"],
};

function buildHeadingLookup(): ReadonlyMap<string, CustomSectionType> {
	const lookup = new Map<string, CustomSectionType>();

	for (const [type, aliases] of Object.entries(SECTION_TITLE_ALIASES)) {
		for (const alias of aliases) lookup.set(alias, type as CustomSectionType);
	}

	for (const [type, aliases] of Object.entries(EXTRA_PDF_HEADING_ALIASES)) {
		for (const alias of aliases) {
			if (!lookup.has(alias)) lookup.set(alias, type as CustomSectionType);
		}
	}

	return lookup;
}

/**
 * Lowercased heading text -> the resume section it most likely introduces.
 * Callers are expected to normalise (case-fold, collapse whitespace, strip punctuation) first.
 */
export const PDF_SECTION_HEADING_LOOKUP = buildHeadingLookup();
