import { describe, expect, it } from "vitest";
import { defaultResumeData } from "./default";
import { parseResumeData } from "./data";
import { parseResumeDataForWrite } from "./write";
import {
	ageLabel,
	formatPeriodRange,
	genderLabel,
	isDuplicateGithubProfile,
	listBasicsContactEntries,
	parseOptionalAge,
	parsePeriodRange,
	politicalStatusLabel,
	sameHttpUrl,
} from "./cn-fields";
import { applyChineseBlankResume } from "./blank-zh-cn";

describe("Chinese resume field compatibility", () => {
	it("fills omitted optional fields when an old resume is read or written", () => {
		const legacy = structuredClone(defaultResumeData) as Record<string, unknown>;
		const basics = { ...(legacy.basics as object) };
		delete (basics as { gender?: string }).gender;
		delete (basics as { age?: string }).age;
		delete (basics as { blog?: unknown }).blog;
		delete (basics as { github?: unknown }).github;
		delete (basics as { politicalStatus?: string }).politicalStatus;
		delete (basics as { politicalStatusOther?: string }).politicalStatusOther;
		delete (basics as { address?: string }).address;
		legacy.basics = basics;

		const read = parseResumeData(legacy);
		const written = parseResumeDataForWrite(legacy);

		expect(read.basics.gender).toBe("");
		expect(read.basics.age).toBe("");
		expect(read.basics.blog).toEqual({ url: "", label: "" });
		expect(read.basics.github).toEqual({ url: "", label: "" });
		expect(read.basics.address).toBe("");
		expect(written.basics).toMatchObject({
			name: defaultResumeData.basics.name,
			headline: defaultResumeData.basics.headline,
			website: defaultResumeData.basics.website,
			gender: "",
			github: { url: "", label: "" },
		});
		expect(written.sections.experience).toEqual(read.sections.experience);
	});

	it("keeps an existing headline, website, and profile while adding empty optional fields", () => {
		const legacy = structuredClone(defaultResumeData);
		legacy.basics.headline = "Backend engineer";
		legacy.basics.website = { url: "https://example.com", label: "Site" };
		legacy.sections.profiles.items = [
			{
				id: "github",
				hidden: false,
				icon: "github-logo",
				iconColor: "",
				network: "GitHub",
				username: "ada",
				website: { url: "https://github.com/ada", label: "ada", inlineLink: false },
			},
		];

		const parsed = parseResumeData(legacy);

		expect(parsed.basics.headline).toBe("Backend engineer");
		expect(parsed.basics.website.url).toBe("https://example.com");
		expect(parsed.sections.profiles.items[0]?.website.url).toBe("https://github.com/ada");
		expect(parsed.basics.github?.url).toBe("");
	});
});

describe("contact display", () => {
	it("hides empty optional basics and shows a filled Chinese contact line once", () => {
		const basics = structuredClone(defaultResumeData.basics);
		expect(listBasicsContactEntries(basics, "zh-CN")).toEqual([]);

		basics.name = "林知远";
		basics.phone = "13800000000";
		basics.email = "lin@example.com";
		basics.gender = "male";
		basics.age = "25";
		basics.blog = { url: "https://blog.example.com/long", label: "" };
		basics.github = { url: "https://github.com/lin", label: "" };
		basics.website = { url: "https://blog.example.com/long", label: "same" };
		basics.politicalStatus = "party-member";
		basics.location = "杭州";
		basics.address = "西湖区";

		expect(listBasicsContactEntries(basics, "zh-CN").map((entry) => [entry.name, entry.text])).toEqual([
			["email", "lin@example.com"],
			["phone", "13800000000"],
			["gender", "男"],
			["age", "25岁"],
			["location", "杭州"],
			["address", "西湖区"],
			["political", "中共党员"],
			["blog", "个人博客"],
			["github", "GitHub"],
		]);
	});

	it("does not display an unreasonable age or an empty political status", () => {
		expect(parseOptionalAge("")).toBeNull();
		expect(parseOptionalAge("0")).toBeNull();
		expect(parseOptionalAge("121")).toBeNull();
		expect(parseOptionalAge("25")).toBe("25");
		expect(ageLabel("abc", "zh-CN")).toBeNull();
		expect(politicalStatusLabel("other", "   ", "zh-CN")).toBeNull();
		expect(politicalStatusLabel("other", "群众团体", "zh-CN")).toBe("群众团体");
	});

	it("prints male, female, and other, and hides an empty or undisclosed gender", () => {
		expect(genderLabel("", "zh-CN")).toBeNull();
		expect(genderLabel("   ", "en-US")).toBeNull();
		expect(genderLabel("male", "zh-CN")).toBe("男");
		expect(genderLabel("female", "zh-CN")).toBe("女");
		expect(genderLabel("male", "en-US")).toBe("Male");
		expect(genderLabel("female", "en-US")).toBe("Female");
		expect(genderLabel("other", "zh-CN")).toBe("其他");
		expect(genderLabel("other", "zh-TW")).toBe("其他");
		expect(genderLabel("other", "en-US")).toBe("Other");
		expect(genderLabel("undisclosed", "zh-CN")).toBeNull();
		expect(genderLabel("undisclosed", "zh-TW")).toBeNull();
		expect(genderLabel("undisclosed", "en-US")).toBeNull();

		const hidden = structuredClone(defaultResumeData.basics);
		hidden.gender = "undisclosed";
		hidden.email = "lin@example.com";
		expect(listBasicsContactEntries(hidden, "zh-CN").map((entry) => entry.name)).toEqual(["email"]);

		const shown = structuredClone(defaultResumeData.basics);
		shown.gender = "other";
		expect(listBasicsContactEntries(shown, "en-US").map((entry) => [entry.name, entry.text])).toEqual([
			["gender", "Other"],
		]);
	});

	it("keeps a previously saved undisclosed gender readable and writable without printing it", () => {
		const legacy = structuredClone(defaultResumeData);
		legacy.basics.gender = "undisclosed";
		legacy.basics.name = "林知远";

		const read = parseResumeData(legacy);
		const written = parseResumeDataForWrite(legacy);

		expect(read.basics.gender).toBe("undisclosed");
		expect(written.basics.gender).toBe("undisclosed");
		expect(written.basics.name).toBe("林知远");
		expect(listBasicsContactEntries(read.basics, "zh-CN").some((entry) => entry.name === "gender")).toBe(false);
	});

	it("treats a matching GitHub profile as the same link and keeps a different one", () => {
		const basics = { github: { url: "https://github.com/ada/" } };
		const same = { network: "GitHub", website: { url: "https://github.com/ada" } };
		const other = { network: "GitHub", website: { url: "https://github.com/grace" } };

		expect(sameHttpUrl(basics.github.url, same.website.url)).toBe(true);
		expect(isDuplicateGithubProfile(same, basics)).toBe(true);
		expect(isDuplicateGithubProfile(other, basics)).toBe(false);
		expect(isDuplicateGithubProfile(same, { github: { url: "" } })).toBe(false);
	});
});

describe("period helper", () => {
	it("reads a complete range and leaves free-form text untouched", () => {
		expect(parsePeriodRange("March 2022 - Present")).toBeNull();
		expect(parsePeriodRange("2020.09 - 2024.06")).toEqual({ start: "2020-09", end: "2024-06", mode: "date" });
		expect(parsePeriodRange("2020.09 - 至今")).toEqual({ start: "2020-09", end: "", mode: "ongoing" });
		expect(parsePeriodRange("2020.09 - 在读")).toEqual({ start: "2020-09", end: "", mode: "studying" });
		expect(formatPeriodRange("2020-09", "", "ongoing", "zh-CN")).toBe("2020.09 - 至今");
		expect(formatPeriodRange("2020-09", "", "studying", "en-US")).toBe("2020.09 - Studying");
		expect(formatPeriodRange("2020-09", "", "date", "zh-CN")).toBeNull();
	});
});

describe("Chinese blank resume", () => {
	it("places internship and campus sections in a full-width Chinese layout without sample facts", () => {
		const data = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");

		expect(data.metadata.page.locale).toBe("zh-CN");
		expect(data.metadata.typography.body.fontFamily).toBe("Noto Sans SC");
		expect(data.metadata.layout.pages).toEqual([
			{
				fullWidth: true,
				sidebar: [],
				main: [
					"education",
					"skills",
					"zh-internship",
					"experience",
					"projects",
					"zh-campus",
					"awards",
					"certifications",
					"summary",
					"publications",
				],
			},
		]);
		expect(data.customSections.map((section) => [section.id, section.title, section.type, section.items])).toEqual([
			["zh-internship", "实习经历", "experience", []],
			["zh-campus", "校园经历", "experience", []],
		]);
		expect(data.sections.education.title).toBe("教育背景");
		expect(data.summary.title).toBe("个人评价");
		expect(data.basics.name).toBe("");
		expect(data.sections.experience.items).toEqual([]);
	});

	it("does not rewrite a non-Chinese resume", () => {
		const data = applyChineseBlankResume(structuredClone(defaultResumeData), "en-US");
		expect(data.metadata.layout.pages).toEqual(defaultResumeData.metadata.layout.pages);
		expect(data.customSections).toEqual([]);
	});
});
