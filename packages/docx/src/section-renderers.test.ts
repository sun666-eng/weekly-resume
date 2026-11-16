// @vitest-environment happy-dom

import type { CustomSection, ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { getDefaultSectionIconName } from "@reactive-resume/schema/resume/section-icons";
import { buildDocument } from "./builder";
import { documentXml, xmlNodes, xmlTexts } from "./builder.test-helpers";
import { renderBuiltInSection, renderCustomSection, renderSummary, setRenderConfig } from "./section-renderers";

const jszipRequire = createRequire(createRequire(import.meta.url).resolve("docx"));
const JSZip = jszipRequire("jszip") as {
	loadAsync: (archive: Buffer) => Promise<{
		file: (path: string) => { async: (type: "string") => Promise<string> } | null;
	}>;
};

const baseConfig = {
	headingFont: "Inter",
	headingSizeHalfPt: 28,
	bodyFont: "Inter",
	bodySizeHalfPt: 20,
	textColorHex: "111111",
	primaryColorHex: "0563C1",
};

setRenderConfig(baseConfig);

const HEX = "#0563C1";

describe("renderSummary", () => {
	it("returns [] when the section is hidden", () => {
		const summary: ResumeData["summary"] = {
			title: "Summary",
			icon: getDefaultSectionIconName("summary"),
			content: "<p>Hello</p>",
			hidden: true,
			showHeading: true,
			columns: 1,
			keepTogether: false,
			startOnNewPage: false,
		};
		expect(renderSummary(summary, HEX)).toEqual([]);
	});

	it("returns [] when content is empty", () => {
		const summary: ResumeData["summary"] = {
			title: "Summary",
			icon: getDefaultSectionIconName("summary"),
			content: "",
			hidden: false,
			showHeading: true,
			columns: 1,
			keepTogether: false,
			startOnNewPage: false,
		};
		expect(renderSummary(summary, HEX)).toEqual([]);
	});

	it("includes a heading paragraph when both title and content are present", () => {
		const summary: ResumeData["summary"] = {
			title: "Summary",
			icon: getDefaultSectionIconName("summary"),
			content: "<p>Hello world</p>",
			hidden: false,
			showHeading: true,
			columns: 1,
			keepTogether: false,
			startOnNewPage: false,
		};
		const paragraphs = renderSummary(summary, HEX);
		// One heading + the htmlToParagraphs output for one <p>.
		expect(paragraphs.length).toBeGreaterThanOrEqual(2);
	});

	it("omits a disabled heading while retaining summary content", () => {
		const summary: ResumeData["summary"] = {
			title: "Summary",
			icon: getDefaultSectionIconName("summary"),
			content: "<p>Hello world</p>",
			hidden: false,
			showHeading: false,
			columns: 1,
			keepTogether: false,
			startOnNewPage: false,
		};

		const paragraphs = renderSummary(summary, HEX);

		expect(paragraphs).toHaveLength(1);
	});

	it("omits the heading when title is empty but still renders content", () => {
		const summary: ResumeData["summary"] = {
			title: "",
			icon: getDefaultSectionIconName("summary"),
			content: "<p>Hello world</p>",
			hidden: false,
			showHeading: true,
			columns: 1,
			keepTogether: false,
			startOnNewPage: false,
		};
		const paragraphs = renderSummary(summary, HEX);
		expect(paragraphs.length).toBeGreaterThanOrEqual(1);
	});
});

const emptySection = <T extends SectionType>(type: T): ResumeData["sections"][T] =>
	({
		title: "Section",
		icon: getDefaultSectionIconName(type),
		columns: 1,
		hidden: false,
		showHeading: true,
		keepTogether: false,
		startOnNewPage: false,
		items: [],
		...(type === "skills" ? { layout: "default" as const, keywordLayout: "inline" as const } : {}),
	}) as ResumeData["sections"][T];

describe("renderBuiltInSection", () => {
	it("returns [] when the section has no items", () => {
		expect(renderBuiltInSection("experience", emptySection("experience"), HEX)).toEqual([]);
	});

	it("returns [] when section.hidden is true", () => {
		const section = { ...emptySection("experience"), hidden: true };
		expect(renderBuiltInSection("experience", section, HEX)).toEqual([]);
	});

	it("returns [] for an unknown section type", () => {
		expect(renderBuiltInSection("not-a-section" as never, emptySection("experience"), HEX)).toEqual([]);
	});

	it("places a project website in the title paragraph before the description", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.sections.projects.items = [
			{
				id: "project-website",
				hidden: false,
				name: "Linked project",
				period: "2026",
				website: { url: "https://project.example", label: "Project site", inlineLink: false },
				description: "<p>Project description</p>",
			},
		];

		const texts = xmlTexts(documentXml(data));
		expect(texts.indexOf("Linked project")).toBeLessThan(texts.indexOf("Project site"));
		expect(texts.indexOf("Project site")).toBeLessThan(texts.indexOf("Project description"));
		expect(texts.filter((text) => text === "Project site")).toHaveLength(1);
	});

	it("uses the project name as the only link text when inlineLink is enabled", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.sections.projects.items = [
			{
				id: "project-inline-website",
				hidden: false,
				name: "Inline project",
				period: "2026",
				website: { url: "https://project.example", label: "Project site", inlineLink: true },
				description: "<p>Project description</p>",
			},
		];

		const hyperlinks = xmlNodes(documentXml(data), "w:hyperlink");
		expect(hyperlinks.map((node) => xmlTexts(node))).toContainEqual(["Inline project"]);
		expect(xmlTexts(documentXml(data))).not.toContain("Project site");
	});

	it("keeps the link color on an inline project name when a text color is set", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.metadata.design.colors.text = "rgba(17, 17, 17, 1)";
		data.metadata.design.colors.primary = "rgba(220, 38, 38, 1)";
		data.sections.projects.items = [
			{
				id: "project-inline-website",
				hidden: false,
				name: "Inline project",
				period: "2026",
				website: { url: "https://project.example", label: "", inlineLink: true },
				description: "",
			},
		];

		const hyperlink = xmlNodes(documentXml(data), "w:hyperlink").find((node) =>
			xmlTexts(node).includes("Inline project"),
		);
		const colors = JSON.stringify(xmlNodes(hyperlink, "w:color")).toLowerCase();
		expect(colors).toContain("dc2626");
		expect(colors).not.toContain("111111");
	});

	it("writes project website relationships inside their title paragraphs", async () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.sections.projects.items = [
			{
				id: "project-website",
				hidden: false,
				name: "Linked project",
				period: "2026",
				website: { url: "https://project.example/regular", label: "Project site", inlineLink: false },
				description: "<p>Project description</p>",
			},
			{
				id: "project-inline-website",
				hidden: false,
				name: "Inline project",
				period: "2026",
				website: { url: "https://project.example/inline", label: "Inline label", inlineLink: true },
				description: "",
			},
		];

		const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocument(data)));
		const documentPart = await zip.file("word/document.xml")?.async("string");
		const relationshipsPart = await zip.file("word/_rels/document.xml.rels")?.async("string");
		if (!documentPart || !relationshipsPart) throw new Error("Missing DOCX document or relationship part");
		const paragraphs = documentPart.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu) ?? [];
		const regularParagraph = paragraphs.find((paragraph) => paragraph.includes("Linked project"));
		const inlineParagraph = paragraphs.find((paragraph) => paragraph.includes("Inline project"));
		if (!regularParagraph || !inlineParagraph) throw new Error("Missing project title paragraphs");

		expect(regularParagraph).toContain("Project site");
		expect(inlineParagraph).not.toContain("Inline label");
		expect(paragraphs.filter((paragraph) => paragraph.includes("Project site"))).toHaveLength(1);
		expect(paragraphs.findIndex((paragraph) => paragraph.includes("Linked project"))).toBeLessThan(
			paragraphs.findIndex((paragraph) => paragraph.includes("Project description")),
		);
		for (const [paragraph, target] of [
			[regularParagraph, "https://project.example/regular"],
			[inlineParagraph, "https://project.example/inline"],
		] as const) {
			const relationshipId = paragraph.match(/<w:hyperlink\b[^>]*r:id="([^"]+)"/u)?.[1];
			if (!relationshipId) throw new Error(`Missing DOCX hyperlink relationship for ${target}`);
			const relationship = relationshipsPart
				.split("<Relationship")
				.find((candidate) => candidate.includes(`Id="${relationshipId}"`));
			expect(relationship).toContain(`Target="${target}"`);
		}
	});
});

describe("renderCustomSection", () => {
	const baseCustom: CustomSection = {
		id: "custom-1",
		type: "summary",
		title: "Notes",
		icon: getDefaultSectionIconName("summary"),
		columns: 1,
		hidden: false,
		showHeading: true,
		keepTogether: false,
		startOnNewPage: false,
		items: [],
	};

	it("returns [] when the custom section is hidden", () => {
		expect(renderCustomSection({ ...baseCustom, hidden: true }, HEX)).toEqual([]);
	});

	it("returns [] when all items are hidden or empty", () => {
		const section: CustomSection = {
			...baseCustom,
			items: [{ id: "x", hidden: true } as never],
		};
		expect(renderCustomSection(section, HEX)).toEqual([]);
	});

	it("returns [] for an unknown custom section type", () => {
		const section: CustomSection = {
			...baseCustom,
			type: "no-such-type" as never,
			items: [{ id: "x", hidden: false, content: "<p>x</p>" } as never],
		};
		expect(renderCustomSection(section, HEX)).toEqual([]);
	});

	it("renders content for a summary-type custom section", () => {
		const section: CustomSection = {
			...baseCustom,
			type: "summary",
			items: [{ id: "x", hidden: false, content: "<p>Hello</p>" } as never],
		};
		const paragraphs = renderCustomSection(section, HEX);
		// 1 heading + at least one paragraph for the HTML
		expect(paragraphs.length).toBeGreaterThanOrEqual(2);
	});

	it("omits a disabled custom section heading while retaining content", () => {
		const section: CustomSection = {
			...baseCustom,
			showHeading: false,
			items: [{ id: "x", hidden: false, content: "<p>Hello</p>" } as never],
		};

		expect(renderCustomSection(section, HEX)).toHaveLength(1);
	});

	it("renders recipient + content for a cover-letter custom section", () => {
		const section: CustomSection = {
			...baseCustom,
			type: "cover-letter",
			title: "Cover Letter",
			items: [
				{
					id: "x",
					hidden: false,
					recipient: "<p>Dear Jane,</p>",
					content: "<p>Body</p>",
				} as never,
			],
		};
		const paragraphs = renderCustomSection(section, HEX);
		expect(paragraphs).toHaveLength(2);
	});
});

describe("setRenderConfig", () => {
	it("can be called repeatedly with a different config (no throw)", () => {
		expect(() => setRenderConfig({ ...baseConfig, headingFont: "Roboto", primaryColorHex: "ff0000" })).not.toThrow();

		// Restore for any later tests in the file
		setRenderConfig(baseConfig);
	});
});
