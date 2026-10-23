import { CHINA_SKILL_TERMS } from "../../china-job-rules";

/**
 * Word segmentation that keeps technical surface forms intact.
 *
 * `Intl.Segmenter` is the right tool for finding word boundaries across scripts, but it splits
 * "C++" into three pieces and "Node.js" into three more — and those are exactly the terms a
 * candidate is searched on. So segmentation runs first, then a merge pass glues the connector
 * characters that carry meaning back onto their words.
 */

/** Connectors that only join when a word follows immediately: `ci/cd`, `node.js`, `back-end`. */
const JOINING_CONNECTORS = new Set([".", "/", "-", "_"]);
/** Connectors that are meaningful on their own end of a token: `c++`, `c#`, `f#`. */
const TRAILING_CONNECTORS = new Set(["+", "#"]);

type Segment = { text: string; isWordLike: boolean };

const HAN = /\p{Script=Han}/u;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const CHINESE_SKILLS = new RegExp(
	CHINA_SKILL_TERMS.filter((term) => HAN.test(term))
		.sort((a, b) => b.length - a.length)
		.map(escapeRegex)
		.join("|"),
	"giu",
);

export const hasWordSegmenter = () => typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";

function segment(text: string): Segment[] {
	if (hasWordSegmenter()) {
		const segmenter = new Intl.Segmenter(HAN.test(text) ? "zh-CN" : "en", { granularity: "word" });
		return [...segmenter.segment(text)].map((entry) => ({
			text: entry.segment,
			isWordLike: entry.isWordLike ?? false,
		}));
	}

	// Older runtimes: fall back to a plain letter/number split. Same tokens for Latin text.
	return (text.match(/\p{Script=Han}|(?:[^\p{Script=Han}\P{L}]|\p{N})+|[^\p{L}\p{N}]/gu) ?? []).map((piece) => ({
		text: piece,
		isWordLike: /[\p{L}\p{N}]/u.test(piece),
	}));
}

export function tokenize(text: string): string[] {
	// Protect curated Chinese compound skills before ICU can split 微服务 into 微 + 服务.
	const segments: Segment[] = [];
	let offset = 0;
	for (const match of text.matchAll(CHINESE_SKILLS)) {
		segments.push(...segment(text.slice(offset, match.index)));
		segments.push({ text: match[0], isWordLike: true });
		offset = match.index + match[0].length;
	}
	segments.push(...segment(text.slice(offset)));
	const tokens: string[] = [];

	let current = "";
	let joinNext = false;

	const flush = () => {
		const trimmed = current.replace(/^[._/-]+/, (prefix) => (prefix === "." ? "." : "")).replace(/[._/-]+$/, "");
		if (trimmed.length > 0 && /[\p{L}\p{N}]/u.test(trimmed)) tokens.push(trimmed);
		current = "";
		joinNext = false;
	};

	for (let index = 0; index < segments.length; index += 1) {
		const piece = segments[index];
		if (!piece) continue;

		if (piece.isWordLike) {
			if (!joinNext) flush();
			current += piece.text;
			joinNext = false;
			continue;
		}

		const next = segments[index + 1];

		if (JOINING_CONNECTORS.has(piece.text)) {
			// ".net" opens a token; "node.js" continues one. A sentence-ending "." does neither,
			// because nothing word-like follows it immediately.
			if (next?.isWordLike) {
				current += piece.text;
				joinNext = true;
				continue;
			}
		}

		if (TRAILING_CONNECTORS.has(piece.text) && current.length > 0) {
			current += piece.text;
			continue;
		}

		flush();
	}

	flush();

	return tokens;
}

/**
 * Splits text into the runs that n-grams may span. A phrase never crosses a sentence, a bullet,
 * or a line — "React. Node" is not the phrase "react node".
 */
export function splitIntoRuns(text: string): string[] {
	return text
		.split(/[\n\r]+|(?<=[.!?])\s+|[;:](?!\/\/)|[。！？；：，、（）【】•▪◦‣·|,()[\]{}]/)
		.map((run) => run.trim())
		.filter(Boolean);
}
