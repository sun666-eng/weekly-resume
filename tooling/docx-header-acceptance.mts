import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { buildDocx } from "@reactive-resume/docx";
import { createChineseTemplateSample } from "@reactive-resume/schema/resume/sample-zh-cn";
import { templateSchema } from "@reactive-resume/schema/templates";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
type XmlNode = { textContent: string; getAttribute(name: string): string };
const { Window } = require("happy-dom") as {
	Window: new () => {
		DOMParser: new () => {
			parseFromString(xml: string, type: string): { getElementsByTagName(name: string): ArrayLike<XmlNode> };
		};
		Node: unknown;
	};
};
const window = new Window();
Object.assign(globalThis, { DOMParser: window.DOMParser, Node: window.Node });
const phase = process.argv[2] ?? "after";
if (!["before", "after", "downloads"].includes(phase)) throw new Error("Expected before, after, or downloads");
const output = path.join(root, "output/docx-header-fix-20261007", phase);
await mkdir(output, { recursive: true });
const layouts = {
	explicit: { fullWidth: true, main: ["education", "experience", "projects"], sidebar: ["skills"] },
	implicit: { fullWidth: false, main: ["education", "experience", "projects", "skills"], sidebar: [] },
	double: { fullWidth: false, main: ["education", "experience", "projects"], sidebar: ["skills"] },
};
const expected = ["欧阳明月·验收", "Java 后端开发 / DOCX 验收", "header-check@example.test", "13800138000"];
async function inspect(bytes: Uint8Array) {
	const zip = await JSZip.loadAsync(bytes);
	const xmlFile = zip.file("word/document.xml");
	const relsFile = zip.file("word/_rels/document.xml.rels");
	if (!xmlFile || !relsFile) throw new Error("Missing DOCX package parts");
	const xml = await xmlFile.async("string");
	const relationships = await relsFile.async("string");
	const document = new window.DOMParser().parseFromString(xml, "text/xml");
	const texts = Array.from(document.getElementsByTagName("w:t"), (node) => node.textContent as string);
	const counts = Object.fromEntries(expected.map((text) => [text, texts.filter((value) => value === text).length]));
	const fields = [
		"女",
		"28岁",
		"中共党员",
		"杭州",
		"西湖区验收路 123 号",
		"技术博客",
		"作品集",
		"自定义作品",
		"GitHub",
	];
	const missing = fields.filter((text) => !texts.includes(text));
	const rels = new window.DOMParser().parseFromString(relationships, "text/xml");
	const targets = Array.from(
		rels.getElementsByTagName("Relationship"),
		(node) => node.getAttribute("Target") as string,
	);
	// The existing DOCX allowlist excludes tel:; keep the phone visible as plain text.
	const missingLinks = [
		"mailto:header-check@example.test",
		"https://example.test/portfolio",
		"https://example.test/blog",
		"https://example.test/custom",
	].filter((target) => !targets.includes(target));
	const phoneIsPlainText = !targets.some((target) => target.startsWith("tel:"));
	return {
		counts,
		missing,
		missingLinks,
		phoneIsPlainText,
		passed:
			Object.values(counts).every((count) => count === 1) &&
			!missing.length &&
			!missingLinks.length &&
			phoneIsPlainText,
		xml,
		relationships,
		texts,
	};
}

const results: (Omit<Awaited<ReturnType<typeof inspect>>, "xml" | "relationships" | "texts"> & {
	name: string;
	bytes: number;
	sha256: string;
})[] = [];
if (phase === "downloads") {
	const manifest: { name: string; path: string }[] = JSON.parse(
		await readFile(path.join(output, "downloads.json"), "utf8"),
	);
	for (const row of manifest) {
		const bytes = new Uint8Array(await readFile(row.path));
		const { xml, relationships, texts, ...result } = await inspect(bytes);
		await writeFile(path.join(output, `${row.name}.xml`), xml);
		await writeFile(path.join(output, `${row.name}.rels.xml`), relationships);
		results.push({ ...row, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), ...result });
	}
} else {
	for (const template of templateSchema.options) {
		for (const [mode, page] of Object.entries(layouts)) {
			const data = createChineseTemplateSample(template);
			Object.assign(data.basics, {
				name: expected[0],
				headline: expected[1],
				email: expected[2],
				phone: expected[3],
				gender: "female",
				age: "28",
				politicalStatus: "party-member",
				location: "杭州",
				address: "西湖区验收路 123 号",
				website: { url: "https://example.test/portfolio", label: "作品集" },
				blog: { url: "https://example.test/blog", label: "技术博客" },
				github: { url: "https://github.com/header-check", label: "GitHub" },
				customFields: [{ id: "header-custom", icon: "link", text: "自定义作品", link: "https://example.test/custom" }],
			});
			data.picture.hidden = true;
			data.metadata.layout.pages = [structuredClone(page)];
			const original = JSON.stringify(data);
			const blob = await buildDocx(data);
			if (JSON.stringify(data) !== original) throw new Error("Export mutated source data");
			const bytes = new Uint8Array(await blob.arrayBuffer());
			const stem = `${template}-${mode}`;
			await writeFile(path.join(output, `${stem}.docx`), bytes);
			await writeFile(path.join(output, `${stem}.json`), `${original}\n`);
			const { xml, relationships, texts, ...result } = await inspect(bytes);
			await writeFile(path.join(output, `${stem}.xml`), xml);
			await writeFile(path.join(output, `${stem}.rels.xml`), relationships);
			results.push({
				name: stem,
				bytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				...result,
			});
		}
	}
}
await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
console.log(
	JSON.stringify(
		{
			phase,
			total: results.length,
			passed: results.filter((row) => row.passed).length,
			failed: results.filter((row) => !row.passed).map((row) => row.name),
		},
		null,
		2,
	),
);
if (phase !== "before" && results.some((row) => !row.passed)) process.exitCode = 1;
