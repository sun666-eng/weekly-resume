import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";

const url = "https://project.example/a/very/long/path/to/a/complete/result?variant=layout";
const label = "https://project.example/a/very/long/project-name?variant=custom-label";
const normalize = (value: string) => value.replace(/[\s\u200b]/gu, "");

const fixture = (layout: string, displayLabel: string): ResumeData => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = "Project Link Acceptance";
	data.basics.email = "synthetic@example.test";
	data.metadata.page.locale = "en-US";
	data.metadata.page.marginX = 24;
	data.metadata.page.marginY = 24;
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.sections.projects.items = [
		{
			id: "long",
			hidden: false,
			name: "Long project name spanning several words across a narrow title area",
			period: "DATE_LONG",
			website: { url, label: displayLabel, inlineLink: false },
			description: "<p>BODY_long Synthetic description used only for layout acceptance.</p>",
		},
	];
	data.sections.projects.columns = layout === "columns" ? 2 : 1;
	const item = data.sections.projects.items[0];
	if (!item) throw new Error("Expected a synthetic project.");
	data.customSections = [
		{
			...data.sections.projects,
			id: "custom-projects",
			type: "projects",
			title: "Custom Projects",
			items: [
				{
					...item,
					id: "custom-long",
					period: "",
					description: "<p>BODY_custom Synthetic description.</p>",
				},
			],
		},
	];
	data.metadata.layout.pages = [
		{
			fullWidth: layout !== "sidebar",
			main: layout === "sidebar" ? [] : ["projects", "custom-projects"],
			sidebar: layout === "sidebar" ? ["projects", "custom-projects"] : [],
		},
	];
	return data;
};

describe("project title URL wrapping", () => {
	it.each([
		["onyx", "full"],
		["meowth", "columns"],
		["ditgar", "sidebar"],
	] as const)("preserves every displayed character and link target in %s %s", async (template: Template, layout) => {
		for (const displayLabel of ["", label]) {
			const data = fixture(layout, displayLabel);
			const before = JSON.stringify(data);
			const element = (<ResumeDocument data={data} template={template} />) as unknown as Parameters<
				typeof renderToBuffer
			>[0];
			let bytes = new Uint8Array();
			await act(async () => {
				bytes = new Uint8Array(await renderToBuffer(element));
			});
			expect(JSON.stringify(data)).toBe(before);
			const output = process.env.PROJECT_LINK_PDF_DIR;
			if (output) {
				mkdirSync(output, { recursive: true });
				writeFileSync(join(output, `${template}-${displayLabel ? "label" : "url"}.pdf`), bytes);
			}
			const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
			try {
				const pdf = await task.promise;
				const text: string[] = [];
				const targets: string[] = [];
				for (let p = 1; p <= pdf.numPages; p += 1) {
					const page = await pdf.getPage(p);
					const content = await page.getTextContent();
					text.push(...content.items.flatMap((item) => ("str" in item ? [item.str] : [])));
					targets.push(...(await page.getAnnotations()).flatMap((item) => (item.url ? [item.url] : [])));
				}
				const compact = normalize(text.join(""));
				const expected = normalize(displayLabel || url);
				expect(
					compact.split(expected),
					`Complete ${displayLabel ? "label" : "URL"} must appear once per project`,
				).toHaveLength(3);
				expect(compact.indexOf(expected)).toBeLessThan(compact.indexOf("BODY_long"));
				expect(compact.lastIndexOf(expected)).toBeLessThan(compact.indexOf("BODY_custom"));
				expect(targets).toContain(url);
			} finally {
				await task.destroy();
			}
		}
	});
});
