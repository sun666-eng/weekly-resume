import { describe, expect, it } from "vitest";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { parseResumeText } from "./plain-text";

const SAMPLE = `Ada Lovelace
Senior Software Engineer
Berlin, Germany | ada@example.com | +44 20 7946 0100 | https://ada.dev

SUMMARY
Engineer with 10 years building analytical systems.

WORK EXPERIENCE
Analytical Engines  Senior Engineer  Berlin
Jan 2020 - Present
• Led the difference engine rewrite
• Mentored four junior engineers
Babbage Ltd  Engineer  London
Mar 2016 - Dec 2019
• Built the punch card pipeline

EDUCATION
University of London  BSc Mathematics
2012 - 2016

SKILLS
TypeScript, Rust, PostgreSQL

LANGUAGES
English (Native)
German (B2)

CERTIFICATIONS
AWS Solutions Architect  Amazon  2021
`;

describe("parseResumeText", () => {
	const data = parseResumeText(SAMPLE);

	it("always returns schema-valid resume data", () => {
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
	});

	it("reads the contact block", () => {
		expect(data.basics).toMatchObject({
			name: "Ada Lovelace",
			headline: "Senior Software Engineer",
			email: "ada@example.com",
			phone: "+44 20 7946 0100",
			location: "Berlin, Germany",
		});
		expect(data.basics.website.url).toBe("https://ada.dev");
	});

	it("reads the summary as rich text", () => {
		expect(data.summary.content).toBe("<p>Engineer with 10 years building analytical systems.</p>");
	});

	it("splits experience into one entry per role", () => {
		expect(data.sections.experience.items).toHaveLength(2);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "Analytical Engines",
			position: "Senior Engineer",
			location: "Berlin",
			period: "Jan 2020 - Present",
		});
		expect(data.sections.experience.items[1]).toMatchObject({
			company: "Babbage Ltd",
			position: "Engineer",
			period: "Mar 2016 - Dec 2019",
		});
	});

	it("keeps bullets as a list in the description", () => {
		expect(data.sections.experience.items[0]?.description).toBe(
			"<ul><li>Led the difference engine rewrite</li><li>Mentored four junior engineers</li></ul>",
		);
	});

	it("reads education", () => {
		expect(data.sections.education.items[0]).toMatchObject({
			school: "University of London",
			degree: "BSc Mathematics",
			period: "2012 - 2016",
		});
	});

	it("splits a comma separated skills line", () => {
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["TypeScript", "Rust", "PostgreSQL"]);
	});

	it("splits a language from its fluency", () => {
		expect(data.sections.languages.items).toMatchObject([
			{ language: "English", fluency: "Native" },
			{ language: "German", fluency: "B2" },
		]);
	});

	it("reads a trailing year as the certification date", () => {
		expect(data.sections.certifications.items[0]).toMatchObject({
			title: "AWS Solutions Architect",
			issuer: "Amazon",
			date: "2021",
		});
	});

	it("places every populated section on the page in document order", () => {
		expect(data.metadata.layout.pages[0]?.main).toEqual([
			"summary",
			"experience",
			"education",
			"skills",
			"languages",
			"certifications",
		]);
	});
});

describe("parseResumeText Chinese headings", () => {
	it("imports common Chinese resume sections and year-month periods", () => {
		const data = parseResumeText(
			[
				"林志远",
				"后端开发工程师",
				"lin@example.com | 13800000000",
				"",
				"教育背景",
				"示例大学",
				"本科",
				"2020.09 - 2024.06",
				"",
				"实习经历",
				"示例科技有限公司",
				"后端开发实习生",
				"2023.06 - 2023.08",
				"负责接口开发与联调测试",
				"",
				"项目经历",
				"简历平台",
				"2024.01 - 2024.05",
				"实现简历导入和模板预览",
				"",
				"专业技能",
				"TypeScript, Java, PostgreSQL",
			].join("\n"),
		);

		expect(data.basics).toMatchObject({ name: "林志远", email: "lin@example.com" });
		expect(data.sections.education.items).toHaveLength(1);
		expect(data.sections.education.items[0]).toMatchObject({ school: "示例大学", period: "2020.09 - 2024.06" });
		// 实习经历 keeps its own section (zh-internship), matching the dedicated section the Chinese
		// editor provides; it is no longer merged into work experience.
		expect(data.sections.experience.items).toHaveLength(0);
		expect(data.customSections.find((section) => section.id === "zh-internship")?.items[0]).toMatchObject({
			company: "示例科技有限公司",
		});
		expect(data.sections.projects.items).toHaveLength(1);
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["TypeScript", "Java", "PostgreSQL"]);
		expect(data.metadata.layout.pages[0]?.main).toEqual(["education", "zh-internship", "projects", "skills"]);
	});
});

describe("parseResumeText edge cases", () => {
	it("returns usable data for empty input", () => {
		const data = parseResumeText("");
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
		expect(data.basics.name).toBe("");
		expect(data.metadata.layout.pages[0]?.main).toEqual([]);
	});

	it("does not mistake a date range for a phone number", () => {
		const data = parseResumeText("Ada Lovelace\nBerlin\n2016 - 2019\n");
		expect(data.basics.phone).toBe("");
	});

	it("finds a phone after a birth date in a flattened PDF header row", () => {
		const data = parseResumeText("张三\n1995.05.05   +86 180 5252 5252   zhang@example.com");

		expect(data.basics).toMatchObject({
			name: "张三",
			email: "zhang@example.com",
			phone: "+86 180 5252 5252",
		});
	});

	it("keeps an unrecognized heading as a custom section", () => {
		const data = parseResumeText("Ada\n\nSKILLS\nRust\n\nSPEAKING\nGave a talk at a conference\n");
		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ type: "summary", title: "SPEAKING" });
		expect(data.metadata.layout.pages[0]?.main).toContain(data.customSections[0]?.id);
	});

	it("keeps unclassified header parts in the description rather than dropping them", () => {
		const data = parseResumeText("EXPERIENCE\nAcme  Engineer  Berlin  Remote  Contract\n2020 - 2022\n");
		expect(data.sections.experience.items[0]?.description).toContain("Remote");
		expect(data.sections.experience.items[0]?.description).toContain("Contract");
	});

	it("escapes markup found in the source text", () => {
		const data = parseResumeText("SUMMARY\nI write <script>alert(1)</script> safely\n");
		expect(data.summary.content).toContain("&lt;script&gt;");
		expect(data.summary.content).not.toContain("<script>");
	});

	it("treats a heading with a trailing colon as a heading", () => {
		const data = parseResumeText("Ada\n\nSkills:\nRust, Go\n");
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["Rust", "Go"]);
	});
});

describe("parseResumeText review findings", () => {
	it("keeps a section whose heading is the first one in the document", () => {
		const data = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nCAREER HIGHLIGHTS\nShipped the difference engine\nMentored the team\n",
		);

		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ title: "CAREER HIGHLIGHTS" });
		expect(JSON.stringify(data)).toContain("Shipped the difference engine");
	});

	it("keeps one entry when company, position and dates sit on separate lines", () => {
		const data = parseResumeText(
			"EXPERIENCE\nAnalytical Engines\nSenior Engineer\nJan 2020 - Present\n• Led the rewrite\n",
		);

		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "Analytical Engines",
			position: "Senior Engineer",
			period: "Jan 2020 - Present",
		});
	});

	it("does not turn an uppercase company name into a section heading", () => {
		const data = parseResumeText("EXPERIENCE\nACME CORPORATION\nJan 2020 - Present\n• Did the work\n");

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.experience.items[0]).toMatchObject({ company: "ACME CORPORATION" });
	});

	it("escapes single quotes in extracted text", () => {
		const data = parseResumeText("SUMMARY\nIt's a resume\n");
		expect(data.summary.content).toContain("&#39;");
	});
});

describe("parseResumeText multi-line entry preambles", () => {
	it("keeps an uppercase company followed by a separate role line as one entry", () => {
		const data = parseResumeText(
			"EXPERIENCE\nACME CORPORATION\nSenior Engineer\nJan 2020 - Present\n• Led the rewrite\n",
		);

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "ACME CORPORATION",
			position: "Senior Engineer",
			period: "Jan 2020 - Present",
		});
	});

	it("keeps an uppercase school followed by a separate degree line as one entry", () => {
		const data = parseResumeText("EDUCATION\nUNIVERSITY OF LONDON\nBSc Mathematics\n2012 - 2016\n");

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.education.items).toHaveLength(1);
		expect(data.sections.education.items[0]).toMatchObject({
			school: "UNIVERSITY OF LONDON",
			degree: "BSc Mathematics",
			period: "2012 - 2016",
		});
	});

	it("still recognizes a real heading whose section starts with bullets", () => {
		const data = parseResumeText("Ada\nada@example.com\n\nCAREER HIGHLIGHTS\n• Shipped in 2019\n• Grew the team\n");

		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ title: "CAREER HIGHLIGHTS" });
	});
});

describe("parseResumeText personal info sections", () => {
	it("maps contact lines inside a personal info section to basics", () => {
		const data = parseResumeText(
			"测试用户\n\n个人信息\n邮箱：fixture@example.com\n电话：13800000000\n\n教育背景\n示例大学",
		);

		expect(data.basics).toMatchObject({ name: "测试用户", email: "fixture@example.com", phone: "13800000000" });
		expect(data.summary.content).not.toContain("fixture@example.com");
		expect(data.summary.content).not.toContain("13800000000");
		expect(data.sections.education.items[0]).toMatchObject({ school: "示例大学" });
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
	});

	it("reads the name from a labeled line inside the section", () => {
		const data = parseResumeText("个人信息\n姓名：张三\n邮箱：fixture@example.com\n电话：13800000000");

		expect(data.basics).toMatchObject({ name: "张三", email: "fixture@example.com", phone: "13800000000" });
		expect(data.summary.content).not.toContain("张三");
	});

	it("supports the 个人资料 alias and several fields on one line", () => {
		const data = parseResumeText("测试用户\n\n个人资料\n邮箱：fixture@example.com 电话：13800000000");

		expect(data.basics).toMatchObject({ email: "fixture@example.com", phone: "13800000000" });
		expect(data.summary.content).toBe("");
	});

	it("supports spaced Chinese labels from formatted resume text", () => {
		const data = parseResumeText("个人信息\n姓 名：张三  电 话：138 0000 0000  邮 箱：fixture@example.com");

		expect(data.basics).toMatchObject({ name: "张三", email: "fixture@example.com", phone: "138 0000 0000" });
		expect(data.summary.content).toBe("");
	});

	it("extracts bare contact lines under a 联系方式 heading", () => {
		const data = parseResumeText("测试用户\n\n联系方式\nfixture@example.com\n13800000000\nhttps://github.com/fixture");

		expect(data.basics).toMatchObject({ email: "fixture@example.com", phone: "13800000000" });
		expect(data.basics.website.url).toBe("https://github.com/fixture");
		expect(data.basics.headline).not.toBe("联系方式");
	});

	it("supports an English personal information heading", () => {
		const data = parseResumeText("PERSONAL INFORMATION\nEmail: fixture@example.com\nPhone: 13800000000");

		expect(data.basics).toMatchObject({ email: "fixture@example.com", phone: "13800000000" });
	});

	it("keeps a conflicting contact value instead of overwriting basics", () => {
		const data = parseResumeText("测试用户\nada@example.com\n\n个人信息\n邮箱：other@example.com");

		expect(data.basics.email).toBe("ada@example.com");
		expect(data.summary.content).toContain("other@example.com");
	});

	it("drops a duplicated contact value without losing it", () => {
		const data = parseResumeText("测试用户\nada@example.com\n\n个人信息\n邮箱：ada@example.com");

		expect(data.basics.email).toBe("ada@example.com");
		expect(data.summary.content).not.toContain("ada@example.com");
	});

	it("keeps unknown personal fields in the summary while extracting contact details", () => {
		const data = parseResumeText("测试用户\n\n个人信息\n性别：男\n年龄：25\n邮箱：fixture@example.com");

		expect(data.basics.email).toBe("fixture@example.com");
		expect(data.summary.content).toContain("性别：男");
		expect(data.summary.content).toContain("年龄：25");
	});

	it("keeps a personal info section without contact details as summary text", () => {
		const data = parseResumeText("测试用户\n\n个人信息\n热爱技术，具备团队精神\n熟悉敏捷开发");

		expect(data.basics.email).toBe("");
		expect(data.summary.content).toContain("热爱技术，具备团队精神");
		expect(data.summary.content).toContain("熟悉敏捷开发");
	});
});

describe("parseResumeText Chinese resume conventions", () => {
	it("keeps 实习经历 as its own section instead of merging into work experience", () => {
		const data = parseResumeText(
			"测试用户\n\n实习经历\n示例科技有限公司\n后端开发实习生\n2023.06 - 2023.08\n负责接口开发\n\n工作经历\n示例集团\n后端工程师\n2023.09 - 至今\n负责网关开发",
		);

		const internship = data.customSections.find((section) => section.id === "zh-internship");
		expect(internship).toMatchObject({ type: "experience", title: "实习经历" });
		expect(internship?.items[0]).toMatchObject({ company: "示例科技有限公司", position: "后端开发实习生" });
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({ company: "示例集团" });
		expect(data.metadata.layout.pages[0]?.main).toContain("zh-internship");
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
	});

	it("keeps 校园经历 as its own section instead of merging into volunteer", () => {
		const data = parseResumeText(
			"测试用户\n\n校园经历\n学生会\n主席\n2021.09 - 2022.06\n组织校园活动\n\n志愿经历\n图书馆\n整理员\n2021\n整理书籍",
		);

		const campus = data.customSections.find((section) => section.id === "zh-campus");
		expect(campus).toMatchObject({ type: "experience", title: "校园经历" });
		expect(campus?.items[0]).toMatchObject({ company: "学生会", position: "主席" });
		expect(data.sections.volunteer.items).toHaveLength(1);
		expect(data.sections.volunteer.items[0]).toMatchObject({ organization: "图书馆" });
		expect(data.metadata.layout.pages[0]?.main).toContain("zh-campus");
	});

	it("maps a single objective line to the headline and keeps objective prose in the summary", () => {
		const single = parseResumeText("张三\n\n求职意向\n后端开发工程师\n\n教育背景\n示例大学");
		expect(single.basics.headline).toBe("后端开发工程师");
		expect(single.summary.content).not.toContain("后端开发工程师");

		const prose = parseResumeText("张三\n\n求职意向\n期望在后端方向长期发展，参与高并发系统建设\n\n教育背景\n示例大学");
		expect(prose.basics.headline).toBe("");
		expect(prose.summary.content).toContain("期望在后端方向长期发展，参与高并发系统建设");
	});

	it("reads a labeled objective line inside a personal info section as the headline", () => {
		const data = parseResumeText("张三\n\n个人信息\n求职意向：后端开发工程师\n邮箱：fixture@example.com");

		expect(data.basics.headline).toBe("后端开发工程师");
		expect(data.basics.email).toBe("fixture@example.com");
	});

	it("strips the objective label from a headline parsed in the header", () => {
		const data = parseResumeText("张三\n求职意向：后端开发工程师\n13800000000\n");
		expect(data.basics.headline).toBe("后端开发工程师");
		expect(data.basics.phone).toBe("13800000000");
	});
});

describe("parseResumeText uppercase mixed-content lines", () => {
	it("keeps an interest containing uppercase technology names", () => {
		const data = parseResumeText("测试用户\n\n兴趣爱好\nC++/C#/音乐\n");

		expect(data.sections.interests.items.map((item) => item.name)).toEqual(["C++/C#/音乐"]);
		expect(data.customSections).toHaveLength(0);
	});

	it("keeps uppercase skill lines after blank lines inside the skills section", () => {
		const data = parseResumeText(
			"测试用户\n\n专业技能\n编程语言\nJava, Go\n\nSQL\nMQTT\nLINUX\nDocker\n\n教育背景\n示例大学",
		);

		const names = data.sections.skills.items.flatMap((item) => [item.name, ...item.keywords]);
		for (const expected of ["Java", "Go", "SQL", "MQTT", "LINUX", "Docker"]) {
			expect(names).toContain(expected);
		}
		expect(data.customSections).toHaveLength(0);
		expect(data.sections.education.items[0]).toMatchObject({ school: "示例大学" });
	});

	it("keeps a CJK interest line that follows a blank line in its section", () => {
		const data = parseResumeText("测试用户\n\n兴趣爱好\n音乐\n\n书法\n");

		expect(data.sections.interests.items.map((item) => item.name)).toEqual(["音乐", "书法"]);
		expect(data.customSections).toHaveLength(0);
	});
});

describe("parseResumeText four-line entry preambles", () => {
	it("keeps company, role, location and dates as one entry", () => {
		const data = parseResumeText(
			"EXPERIENCE\nACME CORPORATION\nSenior Engineer\nBerlin, Germany\nJan 2020 - Present\n• Led the rewrite\n",
		);

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "ACME CORPORATION",
			position: "Senior Engineer",
			location: "Berlin, Germany",
			period: "Jan 2020 - Present",
		});
	});

	it("keeps school, degree, location and dates as one entry", () => {
		const data = parseResumeText("EDUCATION\nUNIVERSITY OF LONDON\nBSc Mathematics\nLondon, UK\n2012 - 2016\n");

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.education.items).toHaveLength(1);
		expect(data.sections.education.items[0]).toMatchObject({
			school: "UNIVERSITY OF LONDON",
			degree: "BSc Mathematics",
			location: "London, UK",
			period: "2012 - 2016",
		});
	});
});

describe("parseResumeText keeps content the layout hides", () => {
	it("recognizes isolated title-case custom section headings", () => {
		const initial = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nConferences\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);
		const subsequent = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAcme  Engineer\n2020 - 2022\nBuilt products.\n\nConferences\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);

		expect(initial.customSections[0]).toMatchObject({ title: "Conferences" });
		expect(subsequent.customSections[0]).toMatchObject({ title: "Conferences" });
		expect(subsequent.sections.experience.items).toHaveLength(1);
	});

	it("keeps a dated custom section that opens the body", () => {
		const data = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nCONFERENCES\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);

		expect(data.basics.headline).not.toBe("CONFERENCES");
		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ title: "CONFERENCES" });

		const content = data.customSections[0]?.items[0]?.content ?? "";
		for (const line of ["ReactConf", "Berlin", "2021", "Spoke about parsers"]) {
			expect(content).toContain(line);
		}
	});

	it("keeps unbulleted descriptions with their own role", () => {
		const data = parseResumeText(
			"EXPERIENCE\nAcme  Engineer  Berlin\nJan 2020 - Present\nBuilt the thing end to end.\nWorked with a team of five.\nBabbage Ltd  Engineer  London\nMar 2016 - Dec 2019\nDid other work.\n",
		);

		expect(data.sections.experience.items).toHaveLength(2);
		expect(data.sections.experience.items[0]?.description).toContain("Built the thing end to end.");
		expect(data.sections.experience.items[0]?.description).toContain("Worked with a team of five.");
		expect(data.sections.experience.items[1]).toMatchObject({ company: "Babbage Ltd", location: "London" });
	});

	it("does not split an entry on a bare year in a section that ignores single dates", () => {
		const data = parseResumeText(
			"EXPERIENCE\nAcme  Engineer\nJan 2020 - Present\nGrew the team.\nMore work here.\n2022\n",
		);

		expect(data.sections.experience.items).toHaveLength(1);

		const description = data.sections.experience.items[0]?.description ?? "";
		for (const line of ["Grew the team.", "More work here.", "2022"]) {
			expect(description).toContain(line);
		}
	});

	it("stays schema-valid when a section starts with its dates", () => {
		const data = parseResumeText(
			"EXPERIENCE\nJan 2020 - Present\nAcme Corp\nSenior Engineer\n\nEDUCATION\n2012 - 2016\nUniversity of London\n\nCERTIFICATIONS\n2021\n",
		);

		expect(() => resumeDataSchema.parse(data)).not.toThrow();
		expect(data.sections.experience.items[0]).toMatchObject({ company: "Acme Corp", period: "Jan 2020 - Present" });
		expect(data.sections.education.items[0]).toMatchObject({ school: "University of London" });
		expect(data.sections.certifications.items).toHaveLength(0);
	});
});

describe("parseResumeText skill categories colliding with section aliases", () => {
	it("keeps Languages/Tools as skill categories instead of opening sections", () => {
		const data = parseResumeText(
			[
				"GLM Upload Probe",
				"PERSONAL INFORMATION",
				"Email: glm-upload@example.com",
				"Phone: 13800005678",
				"EDUCATION",
				"Upload University EDU-U1",
				"BSc",
				"2020 - 2024",
				"SKILLS",
				"Languages",
				"Java, Go",
				"Tools",
				"Git, Docker",
			].join("\n"),
		);

		expect(data.sections.skills.items.map(({ name, keywords }) => ({ name, keywords }))).toEqual([
			{ name: "Languages", keywords: ["Java", "Go"] },
			{ name: "Tools", keywords: ["Git", "Docker"] },
		]);
		expect(data.sections.languages.items).toHaveLength(0);
		expect(data.sections.education.items[0]).toMatchObject({ school: "Upload University EDU-U1" });
	});

	it("still opens a real languages section after skills", () => {
		const data = parseResumeText("Tester\n\nSKILLS\nJava, Go\n\nLANGUAGES\nEnglish (Native)\nGerman (B2)\n");

		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["Java", "Go"]);
		expect(data.sections.languages.items).toMatchObject([
			{ language: "English", fluency: "Native" },
			{ language: "German", fluency: "B2" },
		]);
	});
});
