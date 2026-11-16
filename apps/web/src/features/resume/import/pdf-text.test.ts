import type { RawExtraction } from "@reactive-resume/resume/ats-pdf";
import { describe, expect, it } from "vitest";
import { buildExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { documentToLines } from "./pdf-text";

const PAGE = { width: 595, height: 842 };
const FONT_SIZE = 10;
const CHAR_WIDTH = 5;

type FixtureItem = { text: string; x: number; y: number; width?: number };

/** `y` is measured from the top of the page; the builder flips it into the PDF's own space. */
function rawExtraction(pages: FixtureItem[][]): RawExtraction {
	return {
		version: 1,
		file: { name: "resume.pdf", sizeBytes: 1024, magicBytesOk: true },
		pageCount: pages.length,
		truncated: false,
		pages: pages.map((items, index) => ({
			pageNumber: index + 1,
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
		})),
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

const linesOf = (...pages: FixtureItem[][]) => documentToLines(buildExtractedDocument(rawExtraction(pages)));

describe("documentToLines", () => {
	it("does not treat right-aligned dates as a separate column", () => {
		const rows = [
			"EXPERIENCE",
			"Example Corp",
			"Engineer",
			"A long description spanning the middle of the page",
			"Another Company",
			"Engineer",
			"More details spanning the middle of the page",
		];
		const items = rows.map((text, index) => ({
			text,
			x: 40,
			y: 40 + index * 20,
			width: index === 3 || index === 6 ? 380 : 90,
		}));
		items.push(
			{ text: "2020 - Present", x: 430, y: 60, width: 90 },
			{ text: "2018 - 2020", x: 430, y: 120, width: 90 },
		);
		expect(linesOf(items)).toEqual([
			"EXPERIENCE",
			"Example Corp  2020 - Present",
			"Engineer",
			rows[3],
			"Another Company  2018 - 2020",
			"Engineer",
			rows[6],
		]);
	});
	it("keeps a full-width header before independently reading both columns", () => {
		const left = ["SKILLS", "Unity", "C++", "SQL", "MQTT", "Docker"];
		const right = ["EDUCATION", "Example University", "BSc", "2020 - 2024", "EXPERIENCE", "Example Corp"];
		expect(
			linesOf([
				{ text: "Full-width name and contact details", x: 40, y: 20, width: 500 },
				...left.map((text, index) => ({ text, x: 40, y: 60 + index * 20 })),
				...right.map((text, index) => ({ text, x: 220, y: 70 + index * 20 })),
			]),
		).toEqual(["Full-width name and contact details", ...left, ...right]);
	});
	it("reads a continuing sidebar across pages before the continuing main column", () => {
		const left = ["SKILLS", "Unity", "C++", "SQL", "MQTT", "Docker"];
		const right = ["EXPERIENCE", "Example Corp", "Engineer", "2020 - Present", "Built services", "Maintained services"];
		const page = (l: string[], r: string[]) => [
			...l.map((text, index) => ({ text, x: 40, y: 60 + index * 20 })),
			...r.map((text, index) => ({ text, x: 220, y: 70 + index * 20 })),
		];
		expect(
			linesOf(
				page(left, right),
				page(
					["Python", "Linux", "Git", "Redis", "Kafka", "Tools"],
					["Led teams", "Released apps", "EDUCATION", "University", "BSc", "2014 - 2018"],
				),
			),
		).toEqual([
			...left,
			"Python",
			"Linux",
			"Git",
			"Redis",
			"Kafka",
			"Tools",
			...right,
			"Led teams",
			"Released apps",
			"EDUCATION",
			"University",
			"BSc",
			"2014 - 2018",
		]);
	});
	it("groups items on the same baseline into one line", () => {
		expect(
			linesOf([
				{ text: "Ada", x: 40, y: 60 },
				{ text: "Lovelace", x: 58, y: 60 },
			]),
		).toEqual(["Ada Lovelace"]);
	});

	it("orders lines from the top of the page down", () => {
		expect(
			linesOf([
				{ text: "Second", x: 40, y: 80 },
				{ text: "First", x: 40, y: 60 },
			]),
		).toEqual(["First", "Second"]);
	});

	it("turns a wide field gap into a double space the parser can split on", () => {
		expect(
			linesOf([
				{ text: "Acme", x: 40, y: 60 },
				{ text: "Engineer", x: 120, y: 60 },
			]),
		).toEqual(["Acme  Engineer"]);
	});

	it("reads every page in order", () => {
		expect(linesOf([{ text: "Page one", x: 40, y: 60 }], [{ text: "Page two", x: 40, y: 60 }])).toEqual([
			"Page one",
			"Page two",
		]);
	});

	it("drops blank items and blank lines", () => {
		expect(
			linesOf([
				{ text: "   ", x: 40, y: 60 },
				{ text: "Ada", x: 40, y: 80 },
			]),
		).toEqual(["Ada"]);
	});

	it("reads each column of a sidebar layout in full instead of interleaving them", () => {
		const sidebar = ["SKILLS", "TypeScript", "Rust", "PostgreSQL", "Docker", "Figma"];
		const main = [
			"EXPERIENCE",
			"Acme Corp",
			"Senior Engineer",
			"Jan 2020 - Present",
			"Led the rewrite",
			"Grew the team",
		];

		expect(
			linesOf([
				...sidebar.map((text, index) => ({ text, x: 40, y: 60 + index * 20 })),
				...main.map((text, index) => ({ text, x: 220, y: 70 + index * 20 })),
			]),
		).toEqual([...sidebar, ...main]);
	});
});
