import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { ResumeDocument } from "../../document";

type ProjectItem = ResumeData["sections"]["projects"]["items"][number];

const project = ({ id, name, ...overrides }: Partial<ProjectItem> & Pick<ProjectItem, "id" | "name">): ProjectItem => ({
	id,
	hidden: false,
	name,
	period: "2026",
	website: { url: "", label: "", inlineLink: false },
	description: "",
	...overrides,
});

const fixture = (narrow = false): ResumeData => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = "Project links fixture";
	data.basics.headline = "Synthetic project-link acceptance";
	data.basics.email = "project-links@example.test";
	data.metadata.page.locale = "en-US";
	data.metadata.page.marginX = 28;
	data.metadata.page.marginY = 20;
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.sections.projects = {
		...data.sections.projects,
		title: "Projects",
		items: [
			project({
				id: "project-regular",
				name: "Regular Project",
				period: "REGULAR_DATE",
				website: { url: "https://project.example/regular", label: "Project Site", inlineLink: false },
				description: "<p>REGULAR_DESCRIPTION</p>",
			}),
			project({
				id: "project-inline",
				name: "Inline Project",
				period: "INLINE_DATE",
				website: { url: "https://project.example/inline", label: "Inline Label", inlineLink: true },
				description: "<p>INLINE_DESCRIPTION</p>",
			}),
			project({
				id: "project-empty",
				name: "No Link Project",
				period: "EMPTY_DATE",
				description: "<p>NO_LINK_DESCRIPTION</p>",
			}),
		],
	};
	data.customSections = [
		{
			...data.sections.projects,
			id: "custom-projects",
			type: "projects",
			title: "Custom Projects",
			items: [
				project({
					id: "custom-project",
					name: "Custom Project",
					period: "CUSTOM_DATE",
					website: { url: "https://project.example/custom", label: "Custom Site", inlineLink: false },
					description: "<p>CUSTOM_DESCRIPTION</p>",
				}),
			],
		},
	];
	data.metadata.layout.pages = [
		{
			fullWidth: !narrow,
			main: narrow ? [] : ["projects", "custom-projects"],
			sidebar: narrow ? ["projects", "custom-projects"] : [],
		},
	];
	return data;
};

type PdfTextItem = { str: string; x: number; y: number; width: number };

const textValues = async (
	bytes: Uint8Array,
): Promise<{ pages: number; values: string[]; items: PdfTextItem[]; linkTargets: string[] }> => {
	const loadingTask = getDocument({ data: bytes, useSystemFonts: true });
	try {
		const document = await loadingTask.promise;
		const values: string[] = [];
		const items: PdfTextItem[] = [];
		const linkTargets: string[] = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
			const page = await document.getPage(pageNumber);
			const content = await page.getTextContent();
			values.push(
				...content.items.flatMap((item) => ("str" in item && typeof item.str === "string" ? [item.str] : [])),
			);
			items.push(
				...content.items.flatMap((item) =>
					"str" in item && typeof item.str === "string"
						? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }]
						: [],
				),
			);
			linkTargets.push(...(await page.getAnnotations({ intent: "display" })).flatMap(({ url }) => (url ? [url] : [])));
		}
		return { pages: document.numPages, values, items, linkTargets };
	} finally {
		await loadingTask.destroy();
	}
};

const renderFixture = async (data: ResumeData, template: Template) => {
	const element = (<ResumeDocument data={data} template={template} />) as unknown as Parameters<
		typeof renderToBuffer
	>[0];
	let bytes = new Uint8Array();
	await act(async () => {
		bytes = new Uint8Array(await renderToBuffer(element));
	});
	return bytes;
};

const firstIndex = (values: readonly string[], marker: string): number => {
	const index = values.findIndex((value) => value.includes(marker));
	if (index < 0) throw new Error(`Missing marker ${marker}`);
	return index;
};

describe("project website placement", () => {
	it.each(templateSchema.options)(
		"renders regular, inline, empty, and custom project links in %s",
		async (template) => {
			const result = await textValues(await renderFixture(fixture(), template));
			const compact = result.values.join("").replaceAll("\u200b", "");

			expect(compact).toContain("Project Site");
			expect(compact).toContain("Custom Site");
			expect(compact).toContain("Inline Project");
			expect(compact).not.toContain("Inline Label");
			expect(compact).toContain("NO_LINK_DESCRIPTION");
			expect(firstIndex(result.values, "Project Site")).toBeLessThan(firstIndex(result.values, "REGULAR_DESCRIPTION"));
			expect(firstIndex(result.values, "Custom Site")).toBeLessThan(firstIndex(result.values, "CUSTOM_DESCRIPTION"));
			expect(result.values.filter((value) => value.includes("Project Site"))).toHaveLength(1);
			expect(result.values.filter((value) => value.includes("Custom Site"))).toHaveLength(1);
			expect(result.linkTargets).toEqual(
				expect.arrayContaining([
					"https://project.example/regular",
					"https://project.example/inline",
					"https://project.example/custom",
				]),
			);
		},
	);

	it.each(["onyx", "ditgar", "meowth", "glalie", "pikachu"] as const)(
		"keeps long project titles and links readable in a narrow %s column",
		async (template) => {
			const data = fixture(true);
			const longProject = project({
				id: "project-long",
				name: "A very long project title that must wrap without covering its date",
				period: "NARROW_DATE",
				website: {
					url: "https://project.example/a/very/long/path/with/query?value=long",
					label: "",
					inlineLink: false,
				},
				description: "<p>NARROW_DESCRIPTION</p>",
			});
			data.sections.projects.items = [longProject];
			data.customSections = [];

			const bytes = await renderFixture(data, template);
			const outputDirectory = process.env.PROJECT_LINK_PDF_DIR;
			if (outputDirectory) {
				mkdirSync(outputDirectory, { recursive: true });
				writeFileSync(join(outputDirectory, `${template}-narrow.pdf`), bytes);
			}
			const result = await textValues(bytes);
			const compact = result.values.join("").replace(/[\s\u200b]/gu, "");
			const normalize = (value: string) => value.replace(/[\s\u200b]/gu, "");

			expect(compact).toContain(normalize(longProject.name));
			expect(compact).toContain("https://project.example");
			expect(compact).toContain("NARROW_DATE");
			expect(firstIndex(result.values, "https:")).toBeLessThan(firstIndex(result.values, "NARROW_DESCRIPTION"));
			expect(result.linkTargets).toContain("https://project.example/a/very/long/path/with/query?value=long");
			const date = result.items.find((item) => item.str.includes("NARROW_DATE"));
			const titleOrLink = result.items.filter((item) =>
				/very long project title|https?:|project\.example/iu.test(item.str),
			);
			expect(date).toBeDefined();
			for (const item of titleOrLink.filter((candidate) => Math.abs(candidate.y - (date?.y ?? 0)) < 1)) {
				const overlaps = item.x < (date?.x ?? 0) + (date?.width ?? 0) && (date?.x ?? 0) < item.x + item.width;
				expect(overlaps, `${item.str} must not overlap the project date`).toBe(false);
			}
		},
	);
});
