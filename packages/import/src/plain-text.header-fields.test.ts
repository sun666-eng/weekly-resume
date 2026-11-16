import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { parseResumeText } from "./plain-text";

const mainBody = `教育背景
合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06
个人简介
HDR28-SUM 原文保留标记。`;

const snapshot = (text: string) => {
	const data = parseResumeText(text);
	return {
		name: data.basics.name,
		headline: data.basics.headline,
		phone: data.basics.phone,
		email: data.basics.email,
		location: data.basics.location,
		summary: data.summary.content,
		education0: data.sections.education.items[0]
			? {
					school: data.sections.education.items[0].school,
					area: data.sections.education.items[0].area,
					degree: data.sections.education.items[0].degree,
					period: data.sections.education.items[0].period,
				}
			: null,
	};
};

describe("H01 labeled 意向岗位 vs name", () => {
	it("splits the same-line labeled objective from the name", () => {
		const data = parseResumeText(
			`林知行 意向岗位：物联网技术支持/实施运维
电话：13800001260 | 邮箱：header-a@example.invalid
${mainBody}`,
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-a@example.invalid",
		});
		expect(data.summary.content).toContain("HDR28-SUM 原文保留标记。");
		expect(data.sections.education.items[0]).toMatchObject({
			school: "合成理工大学",
			area: "物联网工程",
			degree: "本科",
			period: "2023.09 - 2027.06",
		});
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
	});

	it("splits a two-line name and 意向岗位", () => {
		const data = parseResumeText(
			`林知行
意向岗位：物联网技术支持/实施运维
电话：13800001260 | 邮箱：header-a@example.invalid
教育背景
合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06`,
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-a@example.invalid",
		});
	});

	it.each(["求职意向", "求职目标", "目标职位"] as const)("keeps the existing %s header alias", (label) => {
		const data = parseResumeText(`林知行\n${label}：Java 后端开发\n教育背景\n合成理工大学`);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "Java 后端开发" });
	});

	it.each([
		["ascii colon", "林知行 意向岗位:物联网技术支持/实施运维"],
		["two spaces", "林知行  意向岗位：物联网技术支持/实施运维"],
		["tab", "林知行\t意向岗位：物联网技术支持/实施运维"],
		["nbsp", "林知行\u00a0意向岗位：物联网技术支持/实施运维"],
		["internal label spaces", "林知行 意 向 岗 位：物联网技术支持/实施运维"],
	])("splits at the labeled boundary with %s", (_label, header) => {
		const data = parseResumeText(`${header}\n教育背景\n合成理工大学`);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "物联网技术支持/实施运维" });
	});

	it("keeps an unlabeled class token with the labeled objective instead of inventing education fields", () => {
		const data = parseResumeText(
			`林知行 意向岗位：物联网技术支持/实施运维 2027届本科
教育背景
合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06`,
		);
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.headline).toBe("物联网技术支持/实施运维 2027届本科");
		expect(data.sections.education.items[0]).toMatchObject({
			degree: "本科",
			period: "2023.09 - 2027.06",
		});
	});

	it("reads 意向岗位 inside a personal-info section", () => {
		const data = parseResumeText(
			`个人信息
姓名：林知行
意向岗位：物联网技术支持/实施运维
邮箱：header-a@example.invalid
教育背景
合成理工大学`,
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			email: "header-a@example.invalid",
		});
	});

	it("treats a bare 意向岗位 heading like the existing objective section", () => {
		const data = parseResumeText("林知行\n意向岗位\n物联网技术支持/实施运维\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({ name: "林知行", headline: "物联网技术支持/实施运维" });
		expect(data.summary.content).not.toContain("物联网技术支持/实施运维");
	});

	it("does not take the objective as the name when the first header line is only contacts", () => {
		const data = parseResumeText(
			`电话：13800001260 | 邮箱：header-a@example.invalid
林知行
意向岗位：物联网技术支持/实施运维
教育背景
合成理工大学`,
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-a@example.invalid",
		});
	});

	it("keeps unlabeled same-line peers in the name instead of guessing a split", () => {
		const data = parseResumeText("林知行 物联网技术支持/实施运维\n教育背景\n合成理工大学");
		expect(data.basics.name).toBe("林知行 物联网技术支持/实施运维");
		expect(data.basics.headline).toBe("");
	});

	it("splits an English labeled objective after a multi-word name", () => {
		const data = parseResumeText("Mary Jane Watson Job Objective: Backend Engineer\nEducation\nExample University");
		expect(data.basics).toMatchObject({ name: "Mary Jane Watson", headline: "Backend Engineer" });
	});

	it("keeps hyphen and apostrophe name tokens", () => {
		const data = parseResumeText("Jean-Luc O'Connor\nJob Objective: Captain\nEducation\nExample University");
		expect(data.basics).toMatchObject({ name: "Jean-Luc O'Connor", headline: "Captain" });
	});

	it("keeps a legal fullwidth bar inside the name", () => {
		const data = parseResumeText("林｜知行 意向岗位：物联网技术支持/实施运维\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({ name: "林｜知行", headline: "物联网技术支持/实施运维" });
	});

	it("does not treat narrative 意向岗位 in the summary as a header field", () => {
		const data = parseResumeText(
			`林知行
个人简介
参与意向岗位：需求访谈，完成 HDR28-BODY 标记。
教育背景
合成理工大学`,
		);
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.headline).toBe("");
		expect(data.summary.content).toContain("参与意向岗位：需求访谈");
	});

	it("keeps the first headline and leaves a conflicting personal-info value visible", () => {
		const data = parseResumeText(
			`林知行
求职意向：后端开发工程师
个人信息
意向岗位：前端开发工程师
教育背景
合成理工大学`,
		);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "后端开发工程师" });
		expect(data.summary.content).toContain("前端开发工程师");
	});
});

describe("H02 empty contact labels vs retained residue", () => {
	it("drops extracted phone/email labels that remain on the name line", () => {
		const data = parseResumeText(
			"林知行 意向岗位：物联网技术支持/实施运维 电话：13800001260 邮箱：header-b@example.invalid",
		);
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-b@example.invalid",
		});
		expect(data.basics.name).not.toMatch(/电话|邮箱/);
		expect(data.basics.headline).not.toMatch(/电话|邮箱/);
	});

	it("drops originally empty phone and email labels", () => {
		const data = parseResumeText("林知行 意向岗位：物联网技术支持/实施运维 电话： 邮箱：");
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "",
			email: "",
		});
		expect(data.basics.name).not.toMatch(/电话|邮箱/);
	});

	it("keeps explanatory contact text instead of inventing values", () => {
		const data = parseResumeText("林知行\n电话：请通过学校联系 | 邮箱：待补充\n个人简介\nHDR28-SUM");
		expect(data.basics).toMatchObject({ name: "林知行", phone: "", email: "" });
		expect(data.summary.content).toContain("请通过学校联系");
		expect(data.summary.content).toContain("待补充");
		expect(data.summary.content).toContain("HDR28-SUM");
		expect(data.basics.name).not.toMatch(/电话|邮箱/);
	});

	it("reads reversed split contact lines after stripping empty labels", () => {
		const data = parseResumeText("林知行\n邮箱：header-b@example.invalid\n电话：13800001260\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({
			name: "林知行",
			phone: "13800001260",
			email: "header-b@example.invalid",
		});
	});

	it("strips empty labels around a fullwidth bar", () => {
		const data = parseResumeText("林知行 电话：13800001260 ｜ 邮箱：header-b@example.invalid\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({
			name: "林知行",
			phone: "13800001260",
			email: "header-b@example.invalid",
		});
		expect(data.basics.name).not.toMatch(/电话|邮箱|｜/);
	});

	it("keeps an unrecognized email value visible", () => {
		const data = parseResumeText("林知行\n邮箱：不是邮箱\n教育背景\n合成理工大学");
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.email).toBe("");
		expect(data.summary.content).toContain("不是邮箱");
	});

	it("keeps a conflicting second phone visible", () => {
		const data = parseResumeText("林知行\n电话：13800001260\n电话：13900001260\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({ name: "林知行", phone: "13800001260" });
		expect(data.summary.content).toContain("13900001260");
	});

	it("does not treat a body 电话 label as a header field", () => {
		const data = parseResumeText(
			"林知行\n项目经历\nDemoOrder | 2023.09 - 2024.05\n• 电话：项目热线写在正文，HDR28-PROJ。",
		);
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.phone).toBe("");
		expect(data.sections.projects.items[0]?.description).toContain("电话：项目热线写在正文");
	});

	it("keeps a URL whose query contains a label word", () => {
		const data = parseResumeText("林知行\nhttps://example.invalid/resume?电话=1\n教育背景\n合成理工大学");
		expect(data.basics).toMatchObject({
			name: "林知行",
			website: { url: "https://example.invalid/resume?电话=1" },
		});
	});
});

describe("IR04 contact values stop at the next explicit field", () => {
	it.each([
		["P10", "电话：13800001260", "13800001260", ""],
		["P27", "邮箱：first@example.invalid", "", "first@example.invalid"],
		["empty phone", "电话：", "", ""],
		["explanatory phone", "电话：请通过学校联系", "", ""],
		["invalid email", "邮箱：不是邮箱", "", ""],
	])("%s before an objective", (_id, contact, phone, email) => {
		const data = parseResumeText(`林知行 ${contact} 意向岗位：后端\n${mainBody}`);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "后端", phone, email });
		if (contact.includes("请通过学校联系")) expect(data.summary.content).toContain("请通过学校联系");
		if (contact.includes("不是邮箱")) expect(data.summary.content).toContain("不是邮箱");
		expect(data.summary.content).toContain("HDR28-SUM 原文保留标记。");
	});
	it("keeps a second contact and reads the following labeled name and objective", () => {
		const data = parseResumeText(`电话：13800001260\n电话：13900001260 姓名：林知行 意向岗位：后端\n${mainBody}`);
		expect(data.basics).toMatchObject({ name: "林知行", phone: "13800001260", headline: "后端" });
		expect(data.summary.content).toBe("<p>电话：13900001260</p><p>HDR28-SUM 原文保留标记。</p>");
	});
});

describe("IR03 explicit name and objective boundaries", () => {
	it.each(["意向岗位：后端 姓名：林知行", "姓名：林知行 意向岗位：后端", "个人信息\n意向岗位：后端 姓名：林知行"])(
		"P06/P25/P07: %s",
		(header) => {
			const data = parseResumeText(`${header}\n${mainBody}`);
			expect(data.basics).toMatchObject({ name: "林知行", headline: "后端" });
			expect(data.summary.content).toBe("<p>HDR28-SUM 原文保留标记。</p>");
		},
	);
	it("preserves the first explicit name and retains a conflict without splitting legal name punctuation", () => {
		const data = parseResumeText(`Name: Mary Jane Watson Job Objective: C++ / IoT\n姓名：林｜知行\n${mainBody}`);
		expect(data.basics).toMatchObject({ name: "Mary Jane Watson", headline: "C++ / IoT" });
		expect(data.summary.content).toBe("<p>林｜知行</p><p>HDR28-SUM 原文保留标记。</p>");
	});
});

describe("IR01 header content conservation", () => {
	it.each([
		["意向岗位：前端 电话：请通过学校联系", "<p>前端</p><p>电话：请通过学校联系</p>"],
		["电话：请通过学校联系 意向岗位：前端", "<p>电话：请通过学校联系</p><p>前端</p>"],
	])("preserves same-line conflict/contact order: %s", (line, content) => {
		const data = parseResumeText(`林知行 意向岗位：后端\n${line}\n${mainBody}`);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "后端", phone: "" });
		expect(data.summary.content).toBe(`${content}<p>HDR28-SUM 原文保留标记。</p>`);
	});
	it.each([
		["P01 conflicting objective", "意向岗位：前端", "前端"],
		["P11 wrapped class", "2027届本科", "2027届本科"],
	])("%s keeps the original summary and education", (_id, tail, retained) => {
		const data = parseResumeText(`林知行 意向岗位：后端\n${tail}\n${mainBody}`);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "后端" });
		expect(data.summary.content).toBe(`<p>${retained}</p><p>HDR28-SUM 原文保留标记。</p>`);
		expect(data.sections.education.items[0]).toMatchObject({ school: "合成理工大学", degree: "本科" });
		expect(resumeDataSchema.safeParse(data).success).toBe(true);
	});
	it("consumes identical objectives and empty labels, preserving other text once in source order", () => {
		const data = parseResumeText(
			`林知行 意向岗位：后端\n意向岗位：\n意向岗位：后端\n2027届本科\n意向岗位：前端\n电话：请通过学校联系\n说明 a < b & c > d\n${mainBody}`,
		);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "后端", phone: "" });
		expect(data.summary.content).toBe(
			"<p>2027届本科</p><p>意向岗位：前端</p><p>电话：请通过学校联系</p><p>说明 a &lt; b &amp; c &gt; d</p><p>HDR28-SUM 原文保留标记。</p>",
		);
	});
});

const dumpPath = process.env.HDR28_DUMP;
if (dumpPath) {
	it("writes parser snapshots for evidence", () => {
		const cases: Record<string, string> = {
			"H01-main-same-line": `林知行 意向岗位：物联网技术支持/实施运维
电话：13800001260 | 邮箱：header-a@example.invalid
${mainBody}`,
			"H01-two-lines": `林知行
意向岗位：物联网技术支持/实施运维
电话：13800001260 | 邮箱：header-a@example.invalid
教育背景
合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06`,
			"H01-contacts-then-name": `电话：13800001260 | 邮箱：header-a@example.invalid
林知行
意向岗位：物联网技术支持/实施运维
教育背景
合成理工大学`,
			"H01-unlabeled-same-line-conservative": "林知行 物联网技术支持/实施运维\n教育背景\n合成理工大学",
			"H01-existing-求职意向": "林知行\n求职意向：Java 后端开发\n教育背景\n合成理工大学",
			"H01-section-title-意向岗位": "林知行\n意向岗位\n物联网技术支持/实施运维\n教育背景\n合成理工大学",
			"H01-degree-after-objective":
				"林知行 意向岗位：物联网技术支持/实施运维 2027届本科\n教育背景\n合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06",
			"H01-personal-info": `个人信息
姓名：林知行
意向岗位：物联网技术支持/实施运维
邮箱：header-a@example.invalid
教育背景
合成理工大学`,
			"H01-body-not-header": `林知行
个人简介
参与意向岗位：需求访谈，完成 HDR28-BODY 标记。
教育背景
合成理工大学`,
			"H01-legal-bar-name": "林｜知行 意向岗位：物联网技术支持/实施运维\n教育背景\n合成理工大学",
		};
		const rows = Object.fromEntries(Object.entries(cases).map(([id, input]) => [id, snapshot(input)]));
		writeFileSync(dumpPath, `${JSON.stringify(rows, null, 2)}\n`);
		expect(Object.keys(rows)).toHaveLength(Object.keys(cases).length);
	});
}
