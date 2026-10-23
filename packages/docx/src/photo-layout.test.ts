// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { buildDocument } from "./builder";
import { xmlNodes } from "./builder.test-helpers";

const photo = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
	(value) => value.charCodeAt(0),
);

describe("portable DOCX photo", () => {
	for (const template of templateSchema.options) {
		it(`${template}: keeps a visible portrait above a minimum-height paragraph`, () => {
			const data = structuredClone(defaultResumeData);
			data.metadata.template = template;
			data.picture.size = 80;
			data.picture.aspectRatio = 0.75;
			const file = buildDocument(data, undefined, photo);
			const xml = file.Document.View.prepForXml({ file, viewWrapper: file.Document, stack: [] });
			const pictures = xmlNodes(xml, "w:p").filter((paragraph) => xmlNodes(paragraph, "w:drawing").length);
			expect(pictures).toHaveLength(1);
			const spacing = JSON.stringify(xmlNodes(pictures[0], "w:spacing"));
			expect(spacing).toContain("atLeast");
			// 80 pt / 0.75 = 106.67 pt. Text line spacing must not clip this portrait.
			const minimum = Number(spacing.match(/"w:line":(\d+)/)?.[1]);
			expect(minimum).toBeGreaterThanOrEqual(2134);
		});
	}
	it("does not render a hidden photo", () => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		const file = buildDocument(data, undefined, photo);
		const xml = file.Document.View.prepForXml({ file, viewWrapper: file.Document, stack: [] });
		expect(xmlNodes(xml, "w:drawing")).toHaveLength(0);
	});
});
