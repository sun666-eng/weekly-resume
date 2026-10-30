// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { documentXml, headerFixture, xmlTexts } from "./builder.test-helpers";

describe("cover letter DOCX layout", () => {
	it.each(["onyx", "chikorita", "glalie"] as const)(
		"%s suppresses the resume header for a pure cover letter",
		(template) => {
			const data = headerFixture();
			data.metadata.template = template;
			const section = data.customSections.find((section) => section.type === "cover-letter");
			if (section?.type !== "cover-letter") throw new Error("Missing cover letter fixture");
			section.hidden = false;
			const letter = section.items[0];
			if (!letter) throw new Error("Missing cover letter item");
			letter.hidden = false;
			letter.content = "<p>求职信正文探针</p>";
			data.metadata.layout.pages = [{ fullWidth: true, main: [section.id], sidebar: [] }];
			const texts = xmlTexts(documentXml(data));
			expect(texts).toContain("求职信正文探针");
			for (const text of [data.basics.name, data.basics.headline, data.basics.email, data.basics.phone]) {
				expect(texts).not.toContain(text);
			}
		},
	);

	it("keeps unused cover letters out of an ordinary resume", () => {
		const data = headerFixture();
		data.metadata.layout.pages = [{ fullWidth: true, main: ["education"], sidebar: [] }];
		const section = data.customSections.find((section) => section.type === "cover-letter");
		if (section?.type !== "cover-letter") throw new Error("Missing cover letter fixture");
		const letter = section.items[0];
		if (!letter) throw new Error("Missing cover letter item");
		letter.content = "<p>不得混入的求职信正文</p>";
		const texts = xmlTexts(documentXml(data));
		expect(texts).toContain(data.basics.name);
		expect(texts).toContain("教育正文探针");
		expect(texts).not.toContain("不得混入的求职信正文");
	});
});
