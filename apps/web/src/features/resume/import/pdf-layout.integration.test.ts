import { describe, expect, it } from "vitest";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import fixture from "./__fixtures__/multi-page-columns.json";
import { documentToLines } from "./pdf-text";

describe("actual three-page resume with a centered header and continuing sidebar", () => {
	const lines = documentToLines(fixture);
	const data = parseResumeText(lines.join("\n"));
	it("preserves every non-whitespace character exactly once while reordering columns", () => {
		const characters = (text: string) => [...text.replace(/\s/g, "")].sort().join("");
		const source = fixture.pages
			.flatMap((page) => page.lines.flatMap((line) => line.spans.map((span) => span.text)))
			.join("");
		expect(characters(lines.join(""))).toBe(characters(source));
	});
	it("keeps name and contact details ahead of the sections", () => {
		expect(data.basics.name).toBe("虚构姓名验收一");
		expect(data.basics.email).toBe("david.kowalski@email.com");
	});
	it("does not combine skill and education headings on the same baseline", () => {
		expect(lines).toContain("教育背景");
		expect(lines).toContain("Unity Engine");
		expect(lines.some((line) => line.includes("Unity Engine") && line.includes("教育背景"))).toBe(false);
		expect(data.sections.education.items[0]?.school).toBe("University of Washington");
		expect(data.sections.education.items[0]).toMatchObject({
			degree: "Bachelor of Science",
			grade: "3.6 GPA",
			area: "Computer Science",
			location: "Seattle, WA",
		});
	});
	it("keeps continuing sidebar skills out of the work history", () => {
		const work = JSON.stringify(data.sections.experience.items);
		expect(work).toContain("Cascade Studios");
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "Cascade Studios",
			position: "Senior Game Developer",
			location: "Seattle, WA",
		});
		expect(work).not.toContain("Programming Languages");
		expect(work).not.toContain("Game AI");
		expect(JSON.stringify(data.sections.skills.items)).toContain("Game AI");
		expect(data.sections.skills.items.find((item) => item.name === "Unity Engine")).toMatchObject({
			proficiency: "Expert",
			keywords: ["C#", "Editor Tools", "Performance Profiling"],
		});
		expect(data.sections.experience.items[2]).toMatchObject({
			company: "Mobile Games Studio",
			position: "Junior Game Developer",
		});
	});
	it("recognizes translated headings and dated project titles", () => {
		expect(data.sections.certifications.items).toHaveLength(2);
		expect(data.sections.certifications.items).toMatchObject([
			{ title: "Unity Certified Expert: Programmer", issuer: "Unity Technologies" },
			{ title: "Unreal Engine 5 C++ Developer", issuer: "Epic Games (Udemy)" },
		]);
		expect(data.sections.languages.items).toMatchObject([
			{ language: "English", fluency: "Native" },
			{ language: "Polish", fluency: "Conversational" },
		]);
		expect(data.sections.references.items[0]?.name).toBe("Available upon request");
		expect(data.sections.projects.items).toHaveLength(3);
		expect(data.sections.projects.items.map((item) => item.name)).toEqual([
			"Echoes of the Void (Indie Game)",
			"Open Source: Unity Dialogue Framework",
			"Game Jam Participation",
		]);
	});
	it("reads the two volunteer entries independently inside a full-width page", () => {
		expect(data.sections.volunteer.items).toHaveLength(2);
		expect(data.sections.volunteer.items.map((item) => item.organization)).toEqual([
			"Seattle Indies",
			"Code.org Game Development Workshops",
		]);
		expect(data.sections.volunteer.items[0]?.description).not.toContain("Volunteer instructor");
	});
});
