import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";

const templates = ["ditgar", "gengar", "glalie"] as const satisfies readonly Template[];

function resume(fullWidth: boolean): ResumeData {
	const data = structuredClone(defaultResumeData);
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.metadata.page.locale = "en-US";
	data.basics.name = "Probe Name";
	data.basics.headline = "";
	data.basics.gender = "undisclosed";
	data.metadata.layout.sidebarWidth = 35;
	data.metadata.layout.pages = [
		{ fullWidth, main: ["experience"], sidebar: fullWidth ? [] : ["skills"] },
		{ fullWidth, main: ["education"], sidebar: fullWidth ? [] : ["languages"] },
	];
	data.sections.experience.items = [
		{
			id: "job",
			hidden: false,
			company: "FullWidthCo",
			position: "Engineer",
			location: "",
			period: "",
			website: { url: "", label: "", inlineLink: false },
			description: "<p>First page body.</p>",
			roles: [],
		},
	];
	data.sections.education.items = [
		{
			id: "edu",
			hidden: false,
			school: "SecondPageSchool",
			degree: "",
			area: "",
			grade: "",
			location: "",
			period: "",
			website: { url: "", label: "", inlineLink: false },
			description: "<p>Second page body.</p>",
		},
	];
	data.sections.skills.items = [
		{ id: "skill", hidden: false, icon: "", iconColor: "", name: "SidebarSkill", proficiency: "", level: 0, keywords: [] },
	];
	return data;
}

async function textByPage(template: Template, fullWidth: boolean) {
	const source = resume(fullWidth);
	const before = structuredClone(source);
	const bytes = await act(() => renderToBuffer(<ResumeDocument data={source} template={template} />));
	expect(source).toEqual(before);
	const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
	try {
		const document = await loading.promise;
		expect(document.numPages).toBe(2);
		const pages = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
			const page = await document.getPage(pageNumber);
			const items = (await page.getTextContent()).items.flatMap((item) =>
				"str" in item && item.str ? [{ text: item.str, x: item.transform[4] }] : [],
			);
			pages.push(items);
		}
		return pages;
	} finally {
		await loading.destroy();
	}
}

function leftEdge(items: { text: string; x: number }[], needle: string) {
	const match = items.find((item) => item.text.includes(needle));
	if (!match) throw new Error(`Missing ${needle}`);
	return match.x;
}

describe("sidebar templates keep one body width on a full-width resume", () => {
	it.each(templates)("%s uses the same main-column inset on page 1 and page 2", async (template) => {
		const full = await textByPage(template, true);
		const split = await textByPage(template, false);
		const fullFirst = leftEdge(full[0] ?? [], "FullWidthCo");
		const fullSecond = leftEdge(full[1] ?? [], "SecondPageSchool");
		const splitFirst = leftEdge(split[0] ?? [], "FullWidthCo");
		const splitSecond = leftEdge(split[1] ?? [], "SecondPageSchool");

		expect(fullFirst).toBeCloseTo(fullSecond, 0);
		expect(splitFirst).toBeCloseTo(splitSecond, 0);
		expect(splitFirst).toBeGreaterThan(fullFirst + 80);
		expect((full[0] ?? []).some((item) => item.text.includes("Probe Name"))).toBe(true);
		expect((full[0] ?? []).some((item) => /prefer not to say|不公开|其他\/不公开/i.test(item.text))).toBe(false);
		expect((split[0] ?? []).some((item) => item.text.includes("SidebarSkill"))).toBe(true);
	});
});
