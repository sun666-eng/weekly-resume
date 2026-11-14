import { readFileSync, writeFileSync } from "node:fs";

const input = new URL("../packages/fonts/src/webfontlist.json", import.meta.url);
const output = new URL("../packages/fonts/src/webfonts.compact.json", import.meta.url);
const urlPrefix = "https://fonts.gstatic.com/";
const fonts = JSON.parse(readFileSync(input, "utf8"));
const compact = fonts.map(({ family, category, weights, preview, files }) => {
	const entries = Object.entries(files);
	let prefix = entries[0]?.[1] ?? "";
	for (const [, url] of entries) {
		while (!url.startsWith(prefix)) prefix = prefix.slice(0, -1);
	}
	return [
		family,
		category,
		weights,
		preview.startsWith(urlPrefix) ? preview.slice(urlPrefix.length) : preview,
		prefix.startsWith(urlPrefix) ? prefix.slice(urlPrefix.length) : prefix,
		entries.map(([weight, url]) => [weight, url.slice(prefix.length)]),
	];
});
const text = `${JSON.stringify(compact)}\n`;
if (process.argv.includes("--check")) {
	if (readFileSync(output, "utf8") !== text) throw new Error("Font metadata needs regeneration");
} else writeFileSync(output, text);
console.log(
	JSON.stringify({
		fonts: fonts.length,
		sourceBytes: readFileSync(input).length,
		compactBytes: Buffer.byteLength(text),
	}),
);
