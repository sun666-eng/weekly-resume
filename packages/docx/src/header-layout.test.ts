// @vitest-environment happy-dom

import type { Template } from "@reactive-resume/schema/templates";
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { documentXml, headerFixture, xmlNodes, xmlTexts } from "./builder.test-helpers";

const layouts = {
	explicit: { fullWidth: true, main: ["education", "experience"], sidebar: ["skills"] },
	implicit: { fullWidth: false, main: ["education", "experience", "skills"], sidebar: [] },
	double: { fullWidth: false, main: ["education", "experience"], sidebar: ["skills"] },
};
const headerInMain = new Set<Template>(["chikorita", "pikachu"]);
const headerInSidebar = new Set<Template>(["ditgar", "gengar", "glalie"]);

function expectHeaderOnce(xml: unknown, data: ReturnType<typeof headerFixture>) {
	const texts = xmlTexts(xml);
	for (const field of ["name", "headline", "email", "phone"] as const) {
		expect(
			texts.filter((text) => text === data.basics[field]),
			field,
		).toHaveLength(1);
	}
}

describe("resume header layout", () => {
	for (const template of templateSchema.options) {
		for (const [mode, page] of Object.entries(layouts)) {
			it(`${template}: ${mode} preserves one header in the correct region before content`, () => {
				const data = headerFixture();
				data.metadata.template = template;
				data.metadata.layout.pages = [structuredClone(page)];
				const before = structuredClone(data);
				const xml = documentXml(data);
				expectHeaderOnce(xml, data);
				const texts = xmlTexts(xml);
				for (const text of ["教育正文探针", "经历正文探针", "技能正文探针"]) expect(texts).toContain(text);
				const tables = xmlNodes(xml, "w:tbl");
				const body = xmlNodes(xml, "w:body")[0] as Record<string, unknown>[];
				const outsideTables = body.filter((node) => !("w:tbl" in node));
				if (mode !== "double") {
					expect(tables).toHaveLength(0);
					expect(texts[0]).toBe(data.basics.name);
				} else {
					expect(tables).toHaveLength(1);
					const cells = xmlNodes(tables[0], "w:tc");
					const contentProbe = headerInMain.has(template)
						? "教育正文探针"
						: headerInSidebar.has(template)
							? "技能正文探针"
							: null;
					if (contentProbe) {
						const headerCell = cells.find((cell) => xmlTexts(cell).includes(contentProbe));
						expect(xmlTexts(headerCell)[0]).toBe(data.basics.name);
						expect(xmlTexts(outsideTables)).not.toContain(data.basics.name);
					} else {
						expect(xmlTexts(outsideTables)[0]).toBe(data.basics.name);
						expect(xmlTexts(tables)).not.toContain(data.basics.name);
						expect(xmlTexts(body[0])[0]).toBe(data.basics.name);
					}
				}
				expect(data).toEqual(before);
			});
		}
	}

	for (const template of templateSchema.options) {
		for (const modes of [
			["explicit", "explicit"],
			["double", "double"],
			["explicit", "double"],
			["double", "explicit"],
		] as const) {
			it(`${template}: ${modes.join(" then ")} does not repeat the header`, () => {
				const data = headerFixture();
				data.metadata.template = template;
				data.metadata.layout.pages = modes.map((mode) => structuredClone(layouts[mode]));
				expectHeaderOnce(documentXml(data), data);
			});
		}
		it(`${template}: empty layout still exports personal information`, () => {
			const data = headerFixture();
			data.metadata.template = template;
			data.metadata.layout.pages = [];
			expectHeaderOnce(documentXml(data), data);
		});
	}

	it.each(["欧阳明月", "阿依古丽·买买提 / Aygul", "Alice Smith"])("preserves %s", (name) => {
		const data = headerFixture();
		data.basics.name = name;
		data.metadata.page.locale = name === "Alice Smith" ? "en-US" : "zh-CN";
		data.metadata.template = "glalie";
		data.metadata.layout.pages = [layouts.explicit];
		expectHeaderOnce(documentXml(data), data);
	});

	it("omits empty fields and separators without affecting body content", () => {
		const data = headerFixture();
		data.basics = structuredClone(defaultResumeData.basics);
		data.basics.email = "only@example.test";
		data.metadata.layout.pages = [layouts.explicit];
		const texts = xmlTexts(documentXml(data));
		expect(texts[0]).toBe("only@example.test");
		expect(texts).not.toContain("  |  ");
		expect(texts).toContain("教育正文探针");
	});

	it("uses main colors when a template with a colored sidebar becomes single-column", () => {
		const data = headerFixture();
		data.metadata.template = "chikorita";
		data.metadata.design.colors.primary = "#123456";
		data.metadata.design.colors.text = "#234567";
		data.metadata.design.colors.background = "#ffffff";
		data.metadata.layout.pages = [layouts.explicit];
		const paragraphs = xmlNodes(documentXml(data), "w:p");
		for (const [probe, color] of [
			[data.basics.name, "123456"],
			[data.basics.headline, "234567"],
		] as const) {
			const paragraph = paragraphs.find((node) => xmlTexts(node).includes(probe));
			expect(JSON.stringify(xmlNodes(paragraph, "w:color"))).toContain(color);
		}
	});
});
