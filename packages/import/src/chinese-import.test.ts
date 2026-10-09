import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import {
	detectResumeTextLocale,
	finalizeResumeImport,
	parseResumeText,
	parseResumeTextWithDiagnostics,
} from "./plain-text";

describe("Chinese import regression contracts", () => {
	it.each([
		["个人简历\n姓名：张三", "张三"],
		["个人简历\n个人信息\n姓名：张三", "张三"],
		["姓名：阿依古丽·买买提", "阿依古丽·买买提"],
		["个人简历\n欧阳修", "欧阳修"],
		["Ludwig van Beethoven", "Ludwig van Beethoven"],
		["Sarah Broad", "Sarah Broad"],
		["Full Name: Sarah Broad", "Sarah Broad"],
		["姓 名：张三  性 别：男  年 龄：23岁", "张三"],
	])("recognizes the actual name: %s", (text, name) => {
		expect(parseResumeText(text).basics.name).toBe(name);
	});
	it.each(["个人简历", "后端开发工程师", "示例大学", "北京市", "上海市浦东新区示例路1号", "GitHub", "LinkedIn"])(
		"does not promote a title, role, school or address to name: %s",
		(text) => expect(parseResumeText(text).basics.name).toBe(""),
	);
	it("maps explicit Chinese personal fields without swallowing unknown labels", () => {
		const data = parseResumeText(
			"个人简历\n姓名：张三 性别：男 年龄：23岁 民族：汉族\n政治面貌：中共党员\n城市：上海\n地址：上海市，浦东新区\n博客：https://example.com/blog\nGitHub：https://github.com/example\n邮箱：fixture@example.com 电话：13800000000",
		);
		expect(data.basics).toMatchObject({
			name: "张三",
			gender: "male",
			age: "23",
			politicalStatus: "party-member",
			location: "上海",
			address: "上海市，浦东新区",
			email: "fixture@example.com",
			phone: "13800000000",
			blog: { url: "https://example.com/blog" },
			github: { url: "https://github.com/example" },
		});
		expect(data.summary.content).toContain("民族：汉族");
	});
	it("keeps the first explicit name and conflicting raw value", () => {
		const data = parseResumeText("个人信息\n姓名：张三\n姓名：李四");
		expect(data.basics.name).toBe("张三");
		expect(data.summary.content).toContain("李四");
	});
	it("prioritizes labeled contacts, retains later explicit conflicts and normalizes fullwidth values", () => {
		const { data, issues } = parseResumeTextWithDiagnostics(
			"张三\nbare@example.test\n个人信息\n邮箱：first@example.test\n邮箱：second@example.test\n电话：１３８００１３８０００ 年龄：２８岁 现居地：杭州 详细地址：浙江省杭州市，西湖区示例路1号",
		);
		expect(data.basics).toMatchObject({
			email: "first@example.test",
			phone: "13800138000",
			age: "28",
			location: "杭州",
			address: "浙江省杭州市，西湖区示例路1号",
		});
		expect(data.summary.content).toContain("bare@example.test");
		expect(data.summary.content).toContain("second@example.test");
		expect(issues.filter((issue) => issue.code === "conflicting-field")).toHaveLength(2);
	});
	it("uses explicit identity over a bare guess and retains the displaced text", () => {
		const data = parseResumeText("王五\n个人信息\n姓名：张三");
		expect(data.basics.name).toBe("张三");
		expect(data.summary.content).toContain("王五");
	});
	it("sets language from Chinese body and preserves headings and dates", () => {
		const data = parseResumeText(
			"张三\n教育背景\n示例大学  本科  软件工程  2020.09 - 2024.06\n工作经历\n示例公司  后端开发工程师  2024.07 - 至今\n负责服务开发和接口联调\n专业技能\nJava, C++, Node.js",
		);
		expect(data.metadata.page.locale).toBe("zh-CN");
		expect(data.sections.education.title).toBe("教育背景");
		expect(data.sections.education.items[0]?.period).toBe("2020.09 - 2024.06");
	});
});

describe("import diagnostics and language finalization", () => {
	it.each(["0", "121", "二十三", "1995.05.05"])("retains invalid age %s without inferring it", (age) => {
		const { data, issues } = parseResumeTextWithDiagnostics(`姓名：张三 年龄：${age} 出生日期：1995.05.05`);
		expect(data.basics.age).toBe("");
		expect(data.summary.content).toContain(age);
		expect(issues).toContainEqual(expect.objectContaining({ code: "unmapped-field", field: "age" }));
	});
	it("diagnoses conflicts, deduplicates equal values and preserves existing summary", () => {
		const { data, issues } = parseResumeTextWithDiagnostics(
			"姓名：张三\n个人信息\n姓名：张三\n姓名：李四\n民族：汉族\n自我评价\n热爱技术，具备团队精神",
		);
		expect(data.basics.name).toBe("张三");
		expect(data.summary.content).toContain("李四");
		expect(data.summary.content).toContain("民族：汉族");
		expect(data.summary.content).toContain("热爱技术，具备团队精神");
		expect(issues.filter((issue) => issue.code === "conflicting-field")).toHaveLength(1);
		expect(data).not.toHaveProperty("issues");
	});
	it("does not find a personal name inside an experience section", () => {
		const { data, issues } = parseResumeTextWithDiagnostics("工作经历\n张三\n开发工程师\n2020 - 2024\n完成接口开发");
		expect(data.basics.name).toBe("");
		expect(issues).toContainEqual({ code: "missing-name", field: "name", raw: "" });
	});
	it.each(["热爱技术", "熟悉敏捷开发", "参与技术团队建设"])("preserves personal-section prose %s", (text) => {
		const { data } = parseResumeTextWithDiagnostics(`个人信息\n${text}`);
		expect(data.basics.name).toBe("");
		expect(data.summary.content).toContain(text);
	});
	it("protects URLs with ports, custom political status, unknown gender and arbitrary name labels", () => {
		const { data, issues } = parseResumeTextWithDiagnostics(
			"姓名：王路 网站：https://example.com:8080/me 政治面貌：中共预备党员 性别：自定义 民族：汉族",
		);
		expect(data.basics).toMatchObject({
			name: "王路",
			website: { url: "https://example.com:8080/me" },
			politicalStatus: "other",
			politicalStatusOther: "中共预备党员",
			gender: "",
		});
		expect(data.summary.content).toContain("性别：自定义");
		expect(issues).toContainEqual(expect.objectContaining({ field: "gender", code: "unmapped-field" }));
	});
	const chinese =
		"张三\n教育背景\n示例大学本科软件工程\n工作经历\n负责后台服务开发和接口测试\n专业技能\nJava, C++, Node.js";
	const english =
		"Ada Lovelace\nEducation\nUniversity of London Mathematics\nExperience\nSoftware Engineer building reliable services\nSkills\nC++, Node.js, CI/CD";
	it.each(["zh-CN", "en-US"] as const)("detects body independently of %s interface", (fallbackLocale) => {
		expect(parseResumeText(chinese, { fallbackLocale }).metadata.page.locale).toBe("zh-CN");
		expect(parseResumeText(english, { fallbackLocale }).metadata.page.locale).toBe("en-US");
	});
	it("honors explicit language, retains original headings and technical terms", () => {
		const data = parseResumeText(chinese, { locale: "en-US", fallbackLocale: "zh-CN" });
		expect(data.metadata.page.locale).toBe("en-US");
		expect(data.sections.education.title).toBe("教育背景");
		expect(JSON.stringify(data)).toContain("Node.js");
	});
	it("makes short or balanced mixed-language text reviewable", () => {
		for (const text of ["张三", "张三负责后台服务开发和接口测试\nAda builds reliable APIs with careful review."]) {
			expect(detectResumeTextLocale(text)).toBeNull();
			const result = parseResumeTextWithDiagnostics(text, { fallbackLocale: "zh-TW" });
			expect(result.data.metadata.page.locale).toBe("zh-TW");
			expect(result.issues).toContainEqual(expect.objectContaining({ code: "uncertain-language" }));
		}
	});
	it("corrects AI locale using facts or source while preserving input and authored styles", () => {
		const data = structuredClone(defaultResumeData);
		data.basics.name = "张三";
		data.summary.content = "负责后台服务开发和接口测试，参与产品上线和技术方案设计。";
		data.sections.education.title = "自定义教育标题";
		data.metadata.typography.body.fontFamily = "Noto Serif SC";
		const before = structuredClone(data);
		const result = finalizeResumeImport(data, { fallbackLocale: "en-US" });
		expect(result.data.metadata.page.locale).toBe("zh-CN");
		expect(result.data.sections.education.title).toBe("自定义教育标题");
		expect(result.data.metadata.typography.body.fontFamily).toBe("Noto Serif SC");
		expect(data).toEqual(before);
		expect(finalizeResumeImport(data, { sourceText: english }).data.metadata.page.locale).toBe("en-US");
		expect(finalizeResumeImport(data, { sourceText: chinese, locale: "en-GB" }).data.metadata.page.locale).toBe(
			"en-GB",
		);
	});
});
