// @vitest-environment happy-dom

import type { RawExtraction } from "@reactive-resume/resume/ats-pdf";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { parseReactiveResumeJSON } from "@reactive-resume/import/reactive-resume-json";
import { buildExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { restoreGuestSnapshot } from "@reactive-resume/resume/guest-draft";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { extractDocxText } from "./docx-text";
import { documentToLines } from "./pdf-text";
import { getImportReviewIssues } from "./review";

const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const documentXml = (body: string) => `<w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
const docxFile = (xml: string) =>
	new File([zipSync({ "word/document.xml": strToU8(xml) }) as Uint8Array<ArrayBuffer>], "h05.docx");

const PAGE = { width: 595, height: 842 };
const FONT_SIZE = 10;
const CHAR_WIDTH = 5;

type FixtureItem = { text: string; x: number; y: number; width?: number };

function rawExtraction(items: FixtureItem[]): RawExtraction {
	return {
		version: 1,
		file: { name: "h05.pdf", sizeBytes: 1024, magicBytesOk: true },
		pageCount: 1,
		truncated: false,
		pages: [
			{
				pageNumber: 1,
				width: PAGE.width,
				height: PAGE.height,
				rotation: 0,
				items: items.map((item) => ({
					str: item.text,
					transform: [FONT_SIZE, 0, 0, FONT_SIZE, item.x, PAGE.height - item.y - FONT_SIZE] as const,
					width: item.width ?? item.text.length * CHAR_WIDTH,
					height: FONT_SIZE,
					fontRef: "f1",
					hasEol: false,
				})),
				operators: null,
			},
		],
		fonts: [],
		links: [],
		metadata: {
			producer: null,
			creator: null,
			title: null,
			author: null,
			language: null,
			pdfVersion: null,
			isEncrypted: false,
			isXfa: false,
			isCollection: false,
			isTagged: false,
			hasAcroForm: false,
		},
		operatorsAvailable: false,
	};
}

function fields(data: ResumeData) {
	return {
		name: data.basics.name,
		headline: data.basics.headline,
		phone: data.basics.phone,
		email: data.basics.email,
		location: data.basics.location,
		summary: data.summary.content,
		fullWidth: data.metadata.layout.pages[0]?.fullWidth,
		primary: data.metadata.design.colors.primary,
		locale: data.metadata.page.locale,
		template: data.metadata.template,
	};
}

describe("H05 DOCX extract + parse", () => {
	it("splits a same-line labeled objective from a single Word paragraph", async () => {
		const xml = documentXml(
			[
				"林知行 意向岗位：物联网技术支持/实施运维",
				"电话：13800001260 | 邮箱：header-h05@example.invalid",
				"教育背景",
				"合成理工大学 | 物联网工程 | 本科 | 2023.09 - 2027.06",
				"个人简介",
				"HDR28-H05 原文保留标记。",
			]
				.map(p)
				.join(""),
		);
		const extracted = await extractDocxText(docxFile(xml));
		expect(extracted).toContain("林知行 意向岗位：物联网技术支持/实施运维");
		const data = parseResumeText(extracted);
		expect(fields(data)).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-h05@example.invalid",
		});
		expect(data.summary.content).toContain("HDR28-H05 原文保留标记。");
		expect(getImportReviewIssues(data)).toEqual([]);
	});

	it("splits a Word tab between name and 意向岗位", async () => {
		const xml = documentXml(
			`<w:p><w:r><w:t>林知行</w:t><w:tab/><w:t>意向岗位：物联网技术支持/实施运维</w:t></w:r></w:p>${p("教育背景")}${p("合成理工大学")}`,
		);
		const extracted = await extractDocxText(docxFile(xml));
		expect(extracted).toContain("林知行");
		expect(extracted).toContain("意向岗位：物联网技术支持/实施运维");
		const data = parseResumeText(extracted);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "物联网技术支持/实施运维" });
	});

	it("splits table cells that keep company/role-style two-space boundaries", async () => {
		const xml = documentXml(
			`<w:tbl><w:tr><w:tc>${p("林知行")}</w:tc><w:tc>${p("意向岗位：物联网技术支持/实施运维")}</w:tc></w:tr></w:tbl>${p("教育背景")}${p("合成理工大学")}`,
		);
		const extracted = await extractDocxText(docxFile(xml));
		expect(extracted).toContain("林知行");
		expect(extracted).toContain("意向岗位：物联网技术支持/实施运维");
		const data = parseResumeText(extracted);
		expect(data.basics).toMatchObject({ name: "林知行", headline: "物联网技术支持/实施运维" });
	});

	it("splits an English Job Objective after a real DOCX extract", async () => {
		const xml = documentXml(
			[p("Mary Jane Watson Job Objective: Backend Engineer"), p("Education"), p("Example University")].join(""),
		);
		const data = parseResumeText(await extractDocxText(docxFile(xml)));
		expect(data.basics).toMatchObject({ name: "Mary Jane Watson", headline: "Backend Engineer" });
		expect(getImportReviewIssues(data)).toEqual([]);
	});

	it("drops empty contact labels after a real DOCX extract", async () => {
		const xml = documentXml(
			[p("林知行 意向岗位：物联网技术支持/实施运维 电话： 邮箱："), p("教育背景"), p("合成理工大学")].join(""),
		);
		const data = parseResumeText(await extractDocxText(docxFile(xml)));
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.headline).toBe("物联网技术支持/实施运维");
		expect(data.basics.phone).toBe("");
		expect(data.basics.email).toBe("");
		expect(data.basics.name).not.toMatch(/电话|邮箱/);
	});

	it("keeps an unlabeled same-line peer in the name", async () => {
		const xml = documentXml([p("林知行 物联网技术支持/实施运维"), p("教育背景"), p("合成理工大学")].join(""));
		const data = parseResumeText(await extractDocxText(docxFile(xml)));
		expect(data.basics.name).toBe("林知行 物联网技术支持/实施运维");
		expect(data.basics.headline).toBe("");
		expect(getImportReviewIssues(data)).toEqual([]);
	});

	it("keeps the F02 mixed-city line in summary after a real DOCX extract", async () => {
		const xml = documentXml(
			[
				p("林知行"),
				p("城市：杭州 13800001260"),
				p("邮箱：header-h05@example.invalid"),
				p("个人简介"),
				p("HDR28-H05"),
			].join(""),
		);
		const data = parseResumeText(await extractDocxText(docxFile(xml)));
		expect(data.basics.name).toBe("林知行");
		expect(data.basics.location).toBe("");
		expect(data.basics.phone).toBe("13800001260");
		expect(data.basics.email).toBe("header-h05@example.invalid");
		expect(data.summary.content).toContain("城市：杭州 13800001260");
		expect(data.summary.content).toContain("HDR28-H05");
	});
});

describe("H05 PDF join layer + parse (not binary PDF.js)", () => {
	it("parses a same-line labeled header after documentToLines", () => {
		const lines = documentToLines(
			buildExtractedDocument(
				rawExtraction([
					{ text: "林知行 意向岗位：物联网技术支持/实施运维", x: 40, y: 40, width: 280 },
					{ text: "电话：13800001260", x: 40, y: 60, width: 120 },
					{ text: "邮箱：header-h05@example.invalid", x: 40, y: 80, width: 180 },
					{ text: "教育背景", x: 40, y: 110, width: 50 },
					{ text: "合成理工大学", x: 40, y: 130, width: 80 },
					{ text: "个人简介", x: 40, y: 160, width: 50 },
					{ text: "HDR28-H05", x: 40, y: 180, width: 80 },
				]),
			),
		);
		expect(lines[0]).toBe("林知行 意向岗位：物联网技术支持/实施运维");
		const data = parseResumeText(lines.join("\n"));
		expect(data.basics).toMatchObject({
			name: "林知行",
			headline: "物联网技术支持/实施运维",
			phone: "13800001260",
			email: "header-h05@example.invalid",
		});
		expect(data.summary.content).toContain("HDR28-H05");
	});

	it("still splits when a field gap inserts two spaces between name and 意向岗位", () => {
		const lines = documentToLines(
			buildExtractedDocument(
				rawExtraction([
					{ text: "林知行", x: 40, y: 40, width: 30 },
					{ text: "意向岗位：物联网技术支持/实施运维", x: 200, y: 40, width: 200 },
					{ text: "教育背景", x: 40, y: 70, width: 50 },
					{ text: "合成理工大学", x: 40, y: 90, width: 80 },
				]),
			),
		);
		expect(lines[0]).toBe("林知行  意向岗位：物联网技术支持/实施运维");
		const data = parseResumeText(lines.join("\n"));
		expect(data.basics).toMatchObject({ name: "林知行", headline: "物联网技术支持/实施运维" });
	});
});

describe("H05 JSON skip and restore identity", () => {
	it("keeps authored JSON name, headline, locale, layout, and primary without text-rule rewrite", () => {
		const authored = structuredClone(defaultResumeData);
		authored.basics.name = "林知行 意向岗位：物联网技术支持/实施运维";
		authored.basics.headline = "Authored Headline C++";
		authored.metadata.page.locale = "zh-CN";
		const firstPage = authored.metadata.layout.pages[0];
		if (!firstPage) throw new Error("missing layout page");
		firstPage.fullWidth = false;
		authored.metadata.design.colors.primary = "rgba(56, 91, 132, 1)";
		authored.metadata.template = "ditgar";
		const parsed = parseReactiveResumeJSON(JSON.stringify(authored));
		expect(parsed.basics.name).toBe("林知行 意向岗位：物联网技术支持/实施运维");
		expect(parsed.basics.headline).toBe("Authored Headline C++");
		expect(parsed.metadata.page.locale).toBe("zh-CN");
		expect(parsed.metadata.layout.pages[0]?.fullWidth).toBe(false);
		expect(parsed.metadata.design.colors.primary).toBe("rgba(56, 91, 132, 1)");
		expect(parsed.metadata.template).toBe("ditgar");
		expect(getImportReviewIssues(parsed)).toEqual([
			{ kind: "contaminated-name", label: "林知行 意向岗位：物联网技术支持/实施运维" },
		]);
	});

	it("restores a polluted guest snapshot without re-parsing", () => {
		const snapshot = {
			format: "weekly-resume-local-backup" as const,
			version: 1 as const,
			name: "HDR28-OLD",
			data: structuredClone(defaultResumeData),
			photo: null,
		};
		snapshot.data.basics.name = "林知行 意向岗位：物联网技术支持/实施运维";
		snapshot.data.basics.headline = "电话：";
		snapshot.data.picture.url = "";
		const firstPage = snapshot.data.metadata.layout.pages[0];
		if (!firstPage) throw new Error("missing layout page");
		firstPage.fullWidth = true;
		snapshot.data.metadata.design.colors.primary = "rgba(220, 38, 38, 1)";
		snapshot.data.metadata.template = "ditgar";
		const before = structuredClone(snapshot);
		const restored = restoreGuestSnapshot(snapshot);
		expect(restored.name).toBe("HDR28-OLD");
		expect(restored.data.basics.name).toBe("林知行 意向岗位：物联网技术支持/实施运维");
		expect(restored.data.basics.headline).toBe("电话：");
		expect(restored.data.metadata.layout.pages[0]?.fullWidth).toBe(true);
		expect(restored.data.metadata.design.colors.primary).toBe("rgba(220, 38, 38, 1)");
		expect(restored.data.metadata.template).toBe("ditgar");
		expect(snapshot).toEqual(before);
		expect(getImportReviewIssues(restored.data)).toEqual([
			{ kind: "contaminated-name", label: "林知行 意向岗位：物联网技术支持/实施运维" },
		]);
	});
});
