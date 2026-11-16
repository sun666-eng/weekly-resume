import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";

function fixture(overrides: { name: string; headline: string; fullWidth: boolean; primary: string }): ResumeData {
	const data = structuredClone(defaultResumeData);
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.metadata.page.locale = "en-US";
	data.basics.name = overrides.name;
	data.basics.headline = overrides.headline;
	data.basics.gender = "undisclosed";
	data.metadata.template = "ditgar";
	data.metadata.design.colors.primary = overrides.primary;
	data.metadata.layout.sidebarWidth = 35;
	data.metadata.layout.pages = [
		{ fullWidth: overrides.fullWidth, main: ["experience"], sidebar: overrides.fullWidth ? [] : ["skills"] },
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
	data.sections.skills.items = [
		{
			id: "skill",
			hidden: false,
			icon: "",
			iconColor: "",
			name: "SidebarSkill",
			proficiency: "",
			level: 0,
			keywords: [],
		},
	];
	return data;
}

async function renderTexts(data: ResumeData) {
	const before = structuredClone(data);
	const bytes = await act(() => renderToBuffer(<ResumeDocument data={data} template="ditgar" />));
	expect(data).toEqual(before);
	const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
	try {
		const document = await loading.promise;
		expect(document.numPages).toBe(1);
		const page = await document.getPage(1);
		return (await page.getTextContent()).items.flatMap((item) =>
			"str" in item && item.str ? [{ text: item.str, x: item.transform[4] }] : [],
		);
	} finally {
		await loading.destroy();
	}
}

const joined = (items: { text: string }[]) => items.map((item) => item.text).join("");

describe("H05 Ditgar paints stored header fields", () => {
	it("paints a clean name and headline as stored", async () => {
		const items = await renderTexts(
			fixture({ name: "Ada Lin", headline: "IoT Support", fullWidth: true, primary: "rgba(220, 38, 38, 1)" }),
		);
		expect(joined(items)).toContain("Ada Lin");
		expect(joined(items)).toContain("IoT Support");
		expect(joined(items)).not.toMatch(/Job Objective/i);
	});

	it("paints a polluted name as stored instead of splitting it", async () => {
		const items = await renderTexts(
			fixture({
				name: "Ada Lin Job Objective: IoT Support",
				headline: "",
				fullWidth: true,
				primary: "rgba(220, 38, 38, 1)",
			}),
		);
		expect(joined(items)).toContain("Ada Lin Job Objective: IoT Support");
	});

	it("keeps the stored name when only fullWidth or only primary changes", async () => {
		const redFull = await renderTexts(
			fixture({ name: "Ada Lin", headline: "IoT Support", fullWidth: true, primary: "rgba(220, 38, 38, 1)" }),
		);
		const redSplit = await renderTexts(
			fixture({ name: "Ada Lin", headline: "IoT Support", fullWidth: false, primary: "rgba(220, 38, 38, 1)" }),
		);
		const tealFull = await renderTexts(
			fixture({ name: "Ada Lin", headline: "IoT Support", fullWidth: true, primary: "rgba(56, 91, 132, 1)" }),
		);
		expect(joined(redFull)).toContain("Ada Lin");
		expect(joined(redSplit)).toContain("Ada Lin");
		expect(joined(tealFull)).toContain("Ada Lin");
		const bodyX = (items: { text: string; x: number }[]) => {
			const match = items.find((item) => item.text.includes("FullWidthCo"));
			if (!match) throw new Error("missing body");
			return match.x;
		};
		expect(bodyX(redSplit)).toBeGreaterThan(bodyX(redFull) + 80);
		expect(redSplit.some((item) => item.text.includes("SidebarSkill"))).toBe(true);
		expect(redFull.some((item) => item.text.includes("SidebarSkill"))).toBe(false);
	});
});
