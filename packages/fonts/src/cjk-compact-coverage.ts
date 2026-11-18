import coverage from "./cjk-compact-coverage.json";

// A fixed Unicode bitset avoids binary searches for every character while editing.
// Build once; subsequent checks allocate no per-character arrays or strings.
const coveredCodepoints = new Uint8Array(0x110000 >>> 3);
for (const [first, last] of coverage.ranges) {
	if (first === undefined || last === undefined) continue;
	for (let codepoint = first; codepoint <= last; codepoint++) {
		const index = codepoint >>> 3;
		coveredCodepoints[index] = (coveredCodepoints[index] ?? 0) | (1 << (codepoint & 7));
	}
}

export const cjkCompactFamilies = {
	"Noto Sans SC": "Noto Sans SC Compact",
	"Noto Serif SC": "Noto Serif SC Compact",
} as const;

export const getCjkCompactFamily = (family: string): string => {
	if (family === "Noto Sans SC") return cjkCompactFamilies[family];
	if (family === "Noto Serif SC") return cjkCompactFamilies[family];
	return family;
};

export const getCjkFullFamily = (family: string): string => {
	if (family === "Noto Sans SC Compact") return "Noto Sans SC";
	if (family === "Noto Serif SC Compact") return "Noto Serif SC";
	return family;
};

export const isCjkCompactCodepoint = (codepoint: number): boolean =>
	((coveredCodepoints[codepoint >>> 3] ?? 0) & (1 << (codepoint & 7))) !== 0;

export function isCjkCompactText(text: string): boolean {
	for (let index = 0; index < text.length; index++) {
		const codepoint = text.codePointAt(index);
		if (codepoint === undefined || !isCjkCompactCodepoint(codepoint)) return false;
		if (codepoint > 0xffff) index++;
	}
	return true;
}
