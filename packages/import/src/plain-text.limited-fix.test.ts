import { describe, expect, it } from "vitest";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { parseResumeText } from "./plain-text";

// Expectations are transcribed from the synthetic DOCX/PDF source, not the richer JSON control.
const source = (separator: string, city = "城市：杭州") => `林知行
Java 后端开发
tia26@example.invalid
138 0000 1260
${city}
个人简介
TIA26-SUM 合成模板调查简历。
教育背景
合成理工大学${separator}计算机科学与技术${separator}本科${separator}2020.09 - 2024.06
TIA26-EDU 完成数据库与软件工程课程。
工作经历
合成软件实验室${separator}后端开发工程师${separator}杭州${separator}2024.07 - 2025.06
TIA26-EXP 优化订单接口。
项目经历
DemoOrder${separator}2023.09 - 2024.05
TIA26-PROJ 订单演示项目。
专业技能
Java, Spring Boot, MySQL, TIA26-SKILL`;

describe("limited F02 source-based regressions", () => {
	it.each(["|", "｜"])("maps the original file's combined contact line using %s", (separator) => {
		const data = parseResumeText(
			`林知行\n求职意向：Java 后端开发\n电话：138 0000 1260${separator}邮箱：tia26@example.invalid${separator}城市：杭州\n教育经历\n合成理工大学${separator}计算机科学与技术${separator}本科${separator}2020.09 - 2024.06`,
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "Java 后端开发",
			phone: "138 0000 1260",
			email: "tia26@example.invalid",
			location: "杭州",
		});
		expect(data.sections.education.items[0]?.location).toBe("");
	});

	it.each(["|", "｜"])("splits supported entry fields using %s without inventing absent fields", (separator) => {
		const data = parseResumeText(source(separator, ""));
		expect(data.sections.education.items[0]).toMatchObject({
			school: "合成理工大学",
			area: "计算机科学与技术",
			degree: "本科",
			location: "",
			period: "2020.09 - 2024.06",
		});
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "合成软件实验室",
			position: "后端开发工程师",
			location: "杭州",
			period: "2024.07 - 2025.06",
		});
		expect(data.sections.projects.items[0]).toMatchObject({ name: "DemoOrder", period: "2023.09 - 2024.05" });
		expect(data.basics.location).toBe("");
		expect(data.sections.skills.items.every((item) => item.proficiency === "" && item.level === 0)).toBe(true);
	});
	it.each(["城市：杭州", "所在城市: 杭州", "  城 市 ： 杭州  "])(
		"maps an independent explicit header label: %s",
		(city) => {
			const data = parseResumeText(source("|", city));
			expect(data.basics).toMatchObject({
				name: "林知行",
				headline: "Java 后端开发",
				location: "杭州",
				email: "tia26@example.invalid",
				phone: "138 0000 1260",
			});
			expect(data.sections.education.items[0]?.location).toBe("");
		},
	);
	it("maps city in personal information without consuming conflicting or narrative text", () => {
		const data = parseResumeText(
			"林知行\n个人信息\n所在城市：杭州\n城市：上海\n我曾在城市：南京做志愿服务。\n邮箱：fixture@example.invalid",
		);
		expect(data.basics.location).toBe("杭州");
		expect(data.summary.content).toContain("城市：上海");
		expect(data.summary.content).toContain("我曾在城市：南京做志愿服务。");
	});
	it("does not infer a city from narrative or copy an experience city to the header", () => {
		const data = parseResumeText(
			source("|", "").replace("TIA26-SUM 合成模板调查简历。", "喜欢杭州，在城市：上海参与过项目。"),
		);
		expect(data.basics.location).toBe("");
		expect(data.summary.content).toContain("在城市：上海");
	});
	it("preserves literal bars in names, URLs, code and body text", () => {
		const data = parseResumeText(
			"林｜知行\nhttps://example.invalid/a｜b\n项目经历\nDemo｜Order｜2023.09 - 2024.05\n• 使用 a｜b 和 `x | y`，链接 https://example.invalid/a｜b。",
		);
		expect(data.basics.name).toBe("林｜知行");
		expect(data.basics.website.url).toBe("https://example.invalid/a｜b");
		expect(data.sections.projects.items[0]?.name).toBe("Demo｜Order");
		expect(data.sections.projects.items[0]?.description).toContain("a｜b 和 `x | y`");
	});
	it("retains an ambiguous unspaced company name instead of inventing a position", () => {
		const data = parseResumeText("林知行\n工作经历\n研发｜交付实验室｜2024.01 - 2024.06\n• 合成测试说明。");
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "研发｜交付实验室",
			position: "",
			location: "",
		});
	});
	it("keeps mixed dates separate from contact numbers", () => {
		const data = parseResumeText(
			"林知行\n1995.05.05   +86 138 0000 1260   fixture@example.invalid\n工作经历\n合成实验室｜工程师｜杭州｜Sep 2024 - 2025.06\n• 合成工作说明。",
		);
		expect(data.basics.phone).toBe("+86 138 0000 1260");
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "合成实验室",
			position: "工程师",
			location: "杭州",
			period: "Sep 2024 - 2025.06",
		});
	});
});

// Fixed before executing the reviewed parser: reject the mixed city, retain its complete source.
describe("city contact boundary", () => {
	it.each([
		{ field: "phone", contact: "13800001260", phone: "13800001260", email: "" },
		{ field: "email", contact: "a@example.test", phone: "", email: "a@example.test" },
	])("preserves the header city source and extracts $field (conservative refusal)", ({ contact, phone, email }) => {
		const input = `林知行\n城市：杭州 ${contact}\n个人简介\nTIA26-SUM`;
		const data = parseResumeText(input);
		expect.soft(data.basics).toMatchObject({ name: "林知行", location: "", phone, email });
		expect.soft(data.summary.content).toBe(`<p>城市：杭州 ${contact}</p><p>TIA26-SUM</p>`);
		expect.soft(() => resumeDataSchema.parse(data)).not.toThrow();
	});

	it.each([
		{ field: "phone", contact: "13800001260", phone: "13800001260", email: "" },
		{ field: "email", contact: "a@example.test", phone: "", email: "a@example.test" },
	])(
		"preserves the personal-info city source and extracts $field (conservative refusal)",
		({ contact, phone, email }) => {
			const input = `林知行\n个人信息\n城市：杭州 ${contact}\n个人简介\nTIA26-SUM`;
			const data = parseResumeText(input);
			expect.soft(data.basics).toMatchObject({ name: "林知行", location: "", phone, email });
			expect.soft(data.summary.content).toBe(`<p>城市：杭州 ${contact}</p><p>TIA26-SUM</p>`);
			expect.soft(() => resumeDataSchema.parse(data)).not.toThrow();
		},
	);
});
