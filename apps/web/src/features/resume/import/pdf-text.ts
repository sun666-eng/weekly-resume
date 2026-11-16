import type { ExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { isKnownResumeHeading } from "@reactive-resume/import/plain-text";
import { buildExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { extractPdf } from "@/features/ats-checker/extract-client";

/**
 * Turns a PDF into the plain lines `parseResumeText` reads.
 *
 * The extraction itself is the ATS checker's — same worker configuration, same size and password
 * guards, same font-relative line clustering and column-gutter detection. Only the joining differs:
 * the ATS text is prose, while the importer splits header rows on runs of two or more spaces, so a
 * tabbed "Company    Role    Location" has to survive as three fields rather than one phrase.
 */

/** Horizontal gap, relative to font size, above which two spans are separate header fields. */
const FIELD_GAP_RATIO = 1.5;
/** Narrower gaps are still a word break; matches the ratio the ATS extractor joins prose with. */
const SPACE_GAP_RATIO = 0.25;

/** The evidence the ATS layout rules require before calling a page two-column. */
const GUTTER_COVERAGE = 0.85;
const GUTTER_SPLIT_RATIO = 0.25;

type PageGeometry = ExtractedDocument["pages"][number];
type TextSpan = PageGeometry["lines"][number]["spans"][number];

function joinSpans(spans: readonly TextSpan[]): string {
	let text = "";
	let previous: TextSpan | null = null;

	for (const span of spans) {
		if (previous) {
			const gap = span.x - (previous.x + previous.width);
			const fontSize = Math.max(previous.fontSize, span.fontSize, 1);

			if (gap > FIELD_GAP_RATIO * fontSize) text += "  ";
			else if (gap > SPACE_GAP_RATIO * fontSize && !/\s$/.test(text) && !/^\s/.test(span.text)) text += " ";
		}

		text += span.text;
		previous = span;
	}

	return text.trim();
}

/** Mid-point of a convincing gutter, or null on a page that reads as one column. */
function columnSplitX(page: PageGeometry): number | null {
	const gutter = page.gutter;
	if (gutter && gutter.coverage >= GUTTER_COVERAGE && gutter.splitRatio >= GUTTER_SPLIT_RATIO)
		return gutter.x + gutter.width / 2;
	// A centered contact header can occupy an otherwise clear gutter. Evaluate the body only,
	// requiring independent content on both sides so right-aligned dates are not a sidebar.
	const start = page.lines.findIndex((line) => line.spans.some((span) => isKnownResumeHeading(span.text)));
	const lines = start < 0 ? page.lines : page.lines.slice(start);
	const spans = lines.flatMap((line) => line.spans);
	if (spans.length < 12) return null;
	let best: { x: number; score: number } | null = null;
	for (let x = page.width * 0.2; x <= page.width * 0.75; x += 4) {
		const left = spans.filter((span) => span.x + span.width <= x - 4);
		const right = spans.filter((span) => span.x >= x + 4);
		const crossing = spans.length - left.length - right.length;
		if (left.length < 6 || right.length < 6 || crossing / spans.length > 0.08) continue;
		const onlyLeft = lines.filter((line) => line.spans.every((span) => span.x + span.width <= x - 4)).length;
		const onlyRight = lines.filter((line) => line.spans.every((span) => span.x >= x + 4)).length;
		const headingsOnBothSides =
			left.some((span) => isKnownResumeHeading(span.text)) && right.some((span) => isKnownResumeHeading(span.text));
		const independentProse =
			left.filter((span) => span.text.length > 40).length >= 2 &&
			right.filter((span) => span.text.length > 40).length >= 2;
		if (!(onlyLeft >= 3 && onlyRight >= 3) && !headingsOnBothSides && !independentProse) continue;
		const gap = Math.min(...right.map((span) => span.x)) - Math.max(...left.map((span) => span.x + span.width));
		const score = (crossing / spans.length) * 10 - gap / page.width;
		if (!best || score < best.score) best = { x, score };
	}
	return best?.x ?? null;
}

/**
 * Lines grouped by baseline alone interleave a sidebar with the body, which drops a whole work
 * history into the skills section. On a two-column page each column is read out in full instead.
 */
function readingBands(page: PageGeometry): PageGeometry[] {
	if (columnSplitX(page) !== null) return [page];
	// Section-level columns can appear below full-width project descriptions on the same page.
	const starts = page.lines.flatMap((line, index) =>
		line.spans.length === 1 && isKnownResumeHeading(line.spans[0]?.text ?? "") ? [index] : [],
	);
	if (starts.length === 0) return [page];
	if (starts[0] !== 0) starts.unshift(0);
	return starts.map((start, index) => ({ ...page, lines: page.lines.slice(start, starts[index + 1]), gutter: null }));
}

export function documentToLines(doc: ExtractedDocument): string[] {
	const result: string[] = [];
	let left: string[] = [];
	let right: string[] = [];
	let previousSplit: number | null = null;
	let previousWidth = 0;
	const flush = () => {
		result.push(...left, ...right);
		left = [];
		right = [];
	};
	for (const originalPage of doc.pages) {
		const bands = readingBands(originalPage);
		for (const page of bands) {
			if (bands.length > 1) {
				flush();
				previousSplit = null;
			}
			const split = columnSplitX(page);
			if (split === null) {
				flush();
				result.push(...page.lines.map((line) => joinSpans(line.spans)));
			} else {
				const continuing =
					previousSplit !== null && Math.abs(previousSplit - split) < 40 && Math.abs(previousWidth - page.width) < 20;
				if (!continuing) flush();
				const headingStart = continuing
					? -1
					: page.lines.findIndex((line) => line.spans.some((span) => isKnownResumeHeading(span.text)));
				for (const [index, line] of page.lines.entries()) {
					if (
						(bands.length > 1 &&
							index === 0 &&
							line.spans.length === 1 &&
							isKnownResumeHeading(line.spans[0]?.text ?? "")) ||
						index < headingStart ||
						line.spans.some((span) => span.x < split && span.x + span.width > split)
					) {
						flush();
						result.push(joinSpans(line.spans));
						continue;
					}
					const l = line.spans.filter((span) => span.x + span.width / 2 < split);
					const r = line.spans.filter((span) => span.x + span.width / 2 >= split);
					if (l.length) left.push(joinSpans(l));
					if (r.length) right.push(joinSpans(r));
				}
			}
			previousSplit = split;
			previousWidth = page.width;
		}
	}
	flush();
	return result.filter(Boolean);
}

export async function extractPdfLines(file: File): Promise<string[]> {
	return documentToLines(buildExtractedDocument(await extractPdf(file, { operatorBudgetMs: 0 })));
}
