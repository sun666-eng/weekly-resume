// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseResumeText, parseResumeTextWithDiagnostics } from "@reactive-resume/import/plain-text";
import { extractDocxText, extractWordXmlText } from "./docx-text";

const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const document = (body: string) => `<w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
const file = (xml: string, additional: Record<string, Uint8Array> = {}) =>
	new File([zipSync({ "word/document.xml": strToU8(xml), ...additional }) as Uint8Array<ArrayBuffer>], "resume.docx");

describe("basic Word extraction", () => {
	it("retains English names and source language under a Chinese interface", async () => {
		const bytes = await readFile(resolve("../../tests/e2e/fixtures/english-import-paragraph.docx"));
		const text = await extractDocxText(new File([new Uint8Array(bytes)], "english.docx"));
		const { data } = parseResumeTextWithDiagnostics(text, { fallbackLocale: "zh-CN" });
		expect(data.basics.name).toBe("Sarah Broad");
		expect(data.basics.email).toBe("sarah.broad@example.test");
		expect(data.metadata.page.locale).toBe("en-US");
		expect(data.sections.education.title).toBe("Education");
		expect(JSON.stringify(data)).toContain("Designed reliable services");
	});
	it.each(["chinese-import-paragraph.docx", "chinese-import-table-header.docx"])(
		"extracts and parses an actual fictional file: %s",
		async (name) => {
			const bytes = await readFile(resolve("../../tests/e2e/fixtures", name));
			const input = new File([new Uint8Array(bytes)], name);
			const text = await extractDocxText(input);
			const { data, issues } = parseResumeTextWithDiagnostics(text, { fallbackLocale: "en-US" });
			expect(data.basics).toMatchObject({
				name: "欧阳明月",
				email: "import-fixture@example.test",
				phone: "13800138000",
				age: "28",
				gender: "female",
				politicalStatus: "party-member",
				location: "杭州",
				address: "浙江省杭州市，西湖区示例路1号",
				blog: { url: "https://example.test/blog" },
				github: { url: "https://github.com/example" },
			});
			expect(data.basics.headline.replace(/\s+/g, " ")).toBe("Java 后端开发工程师");
			expect(data.metadata.page.locale).toBe("zh-CN");
			expect(JSON.stringify(data)).toContain("负责接口开发、服务测试与技术方案设计");
			expect(data.sections.education.items[0]?.period).toBe("2020.09 - 2024.06");
			expect(data.summary.content).toContain("民族：汉族");
			expect(issues.some((issue) => issue.code === "missing-name" || issue.code === "conflicting-field")).toBe(false);
			expect(new Uint8Array(await input.arrayBuffer())).toEqual(new Uint8Array(bytes));
		},
	);
	it("structures Chinese contact information and skill groups without AI", async () => {
		const xml = document(
			[
				"个人信息",
				"姓名：虚构甲",
				"邮箱：fixture@example.test",
				"电话：13800000000",
				"专业技能",
				"开发基础：Spring Boot, SQL, Docker",
			]
				.map(p)
				.join(""),
		);
		const data = parseResumeText(await extractDocxText(file(xml)));
		expect(data.basics).toMatchObject({ name: "虚构甲", email: "fixture@example.test", phone: "13800000000" });
		expect(data.sections.skills.items[0]).toMatchObject({
			name: "开发基础",
			keywords: ["Spring Boot", "SQL", "Docker"],
		});
	});
	it("preserves table row cell boundaries and reads hyperlinks as text", async () => {
		const xml = document(
			`${p("工作经历")}<w:tbl><w:tr><w:tc>${p("示例有限公司")}</w:tc><w:tc>${p("后端工程师")}</w:tc><w:tc>${p("2023.06 - 至今")}</w:tc></w:tr></w:tbl>${p("负责接口开发")}<w:p><w:hyperlink><w:r><w:t>项目链接</w:t></w:r></w:hyperlink></w:p>`,
		);
		const text = await extractDocxText(file(xml));
		expect(text).toContain("示例有限公司  后端工程师  2023.06 - 至今");
		expect(text).toContain("项目链接");
		expect(parseResumeText(text).sections.experience.items[0]).toMatchObject({
			company: "示例有限公司",
			position: "后端工程师",
		});
	});
	it("preserves split runs, XML entities, tabs and line breaks", () => {
		expect(
			extractWordXmlText(
				document(
					"<w:p><w:r><w:t>张</w:t></w:r><w:r><w:t>三 &amp; C++</w:t><w:tab/><w:t>SQL</w:t><w:br/><w:t>&lt;内容&gt;</w:t></w:r></w:p>",
				),
			),
		).toBe("张三 & C++  SQL\n<内容>");
	});
	it("uses final visible revision text and ignores field instructions", () => {
		const xml = document(
			"<w:p><w:del><w:r><w:t>已删除</w:t></w:r></w:del><w:ins><w:r><w:t>保留</w:t></w:r></w:ins><w:r><w:rPr><w:vanish/></w:rPr><w:t>隐藏</w:t></w:r><w:r><w:instrText>HYPERLINK private</w:instrText><w:t>链接文字</w:t></w:r></w:p>",
		);
		expect(extractWordXmlText(xml)).toBe("保留链接文字");
	});
	it("does not treat vanish=false as hidden", () => {
		expect(
			extractWordXmlText(document('<w:p><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>可见</w:t></w:r></w:p>')),
		).toBe("可见");
	});
	it("supports strict OOXML namespace", async () => {
		expect(
			await extractDocxText(
				file(document(p("严格格式中文")).replace(namespace, "http://purl.oclc.org/ooxml/wordprocessingml/main")),
			),
		).toBe("严格格式中文");
	});
	it("supports UTF-16 encoded documents", async () => {
		const xml = document(p("中文编码"));
		const utf16 = new Uint8Array(2 + xml.length * 2);
		utf16.set([0xff, 0xfe]);
		const view = new DataView(utf16.buffer);
		for (let i = 0; i < xml.length; i++) view.setUint16(2 + i * 2, xml.charCodeAt(i), true);
		const archive = new File([zipSync({ "word/document.xml": utf16 }) as Uint8Array<ArrayBuffer>], "utf16.docx");
		expect(await extractDocxText(archive)).toBe("中文编码");
	});
	it("reads referenced headers and footers once, ignoring orphan and external references", async () => {
		const xml = document(
			`${p("教育背景")}<w:sectPr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:headerReference r:id="h1"/><w:headerReference r:id="h1"/><w:headerReference r:id="external"/><w:footerReference r:id="f1"/></w:sectPr>`,
		);
		const archive = file(xml, {
			"word/_rels/document.xml.rels": strToU8(
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h1" Target="header1.xml"/><Relationship Id="f1" Target="/word/footer1.xml"/><Relationship Id="external" Target="https://example.test/private" TargetMode="External"/></Relationships>',
			),
			"word/header1.xml": strToU8(`<w:hdr xmlns:w="${namespace}">${p("姓名：虚构页眉")}</w:hdr>`),
			"word/footer1.xml": strToU8(`<w:ftr xmlns:w="${namespace}">${p("补充说明")}</w:ftr>`),
			"word/header2.xml": strToU8(`<w:hdr xmlns:w="${namespace}">${p("孤立旧页眉")}</w:hdr>`),
		});
		expect(await extractDocxText(archive)).toBe("姓名：虚构页眉\n教育背景\n补充说明");
	});
	it.each(["not a zip", "PK\u0003\u0004broken"])("rejects corrupt archives: %s", async (bytes) => {
		await expect(extractDocxText(new File([bytes], "broken.docx"))).rejects.toThrow("not a readable DOCX");
	});
	it("rejects a ZIP without the Word document", async () => {
		await expect(
			extractDocxText(
				new File([zipSync({ "other.txt": strToU8("not Word") }) as Uint8Array<ArrayBuffer>], "not-word.docx"),
			),
		).rejects.toThrow("not a readable DOCX");
	});
	it("rejects empty/image-only documents", async () => {
		await expect(extractDocxText(file(document("<w:p><w:r><w:drawing/></w:r></w:p>")))).rejects.toThrow(
			"no readable text",
		);
	});
	it.each(["<bad/>", document("<w:p><w:t>broken"), `<!DOCTYPE x [<!ENTITY x "secret">]>${document(p("&x;"))}`])(
		"rejects invalid XML or entity declarations",
		async (xml) => {
			await expect(extractDocxText(file(xml))).rejects.toThrow("not a readable DOCX");
		},
	);
	it("rejects oversized uncompressed XML before inflation", async () => {
		await expect(extractDocxText(file(document(p("x".repeat(2 * 1024 * 1024)))))).rejects.toThrow(
			"not a readable DOCX",
		);
	});
	it("rejects large source files before reading them", async () => {
		const archive = new File([], "large.docx");
		Object.defineProperty(archive, "size", { value: 16 * 1024 * 1024 });
		await expect(extractDocxText(archive)).rejects.toThrow("too large");
	});
	it("does not inflate unrelated large embedded media", async () => {
		expect(
			await extractDocxText(file(document(p("正文")), { "word/media/image.bin": new Uint8Array(3 * 1024 * 1024) })),
		).toBe("正文");
	});
});
