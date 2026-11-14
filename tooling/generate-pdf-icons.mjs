import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/pdf/package.json"));
const installed = dirname(require.resolve("phosphor-icons-react-pdf/dynamic"));
const out = join(root, "packages/pdf/src/templates/shared/pdf-icons/generated");
const check = process.argv.includes("--check");
const weights = ["thin", "light", "regular", "bold", "fill", "duotone"];
const registry = readFileSync(join(installed, "Icon.es.js"), "utf8");
const imports = new Map(
	[...registry.matchAll(/import \{ \w+ as ([\w$]+) \} from "\.\/icons\/([^"]+)";/g)].map((m) => [m[1], m[2]]),
);
const names = new Map(
	[...registry.matchAll(/^\t(?:"([^"]+)"|([\w-]+)): ([\w$]+),?$/gm)].map((m) => [m[1] ?? m[2], imports.get(m[3])]),
);
if (names.size < 1000 || [...names.values()].some((value) => !value))
	throw new Error("Unsupported installed Phosphor registry format");

const core = new Set([
	"acorn",
	"star",
	"at",
	"envelope",
	"envelope-simple",
	"phone",
	"map-pin",
	"globe",
	"link",
	"info",
	"user",
	"flag",
	"calendar",
	"identification-card",
]);
for (const relative of [
	"packages/schema/src/resume/default.ts",
	"packages/resume/src/icons.ts",
	"packages/pdf/src/templates/shared/contact-item.tsx",
]) {
	const source = readFileSync(join(root, relative), "utf8");
	for (const [, name] of source.matchAll(/"([a-z][a-z0-9-]*)"/g)) if (names.has(name)) core.add(name);
}
function scanTemplates(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === "pdf-icons") continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) scanTemplates(path);
		else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
			for (const [, name] of readFileSync(path, "utf8").matchAll(
				/(?:name=|iconName:\s*|emailIconName:\s*)"([a-z0-9-]+)"/g,
			))
				if (names.has(name)) core.add(name);
		}
	}
}
scanTemplates(join(root, "packages/pdf/src/templates"));

const element = (tag, props) => {
	const { children, ...attributes } = props;
	return {
		tag,
		props: attributes,
		children: children === undefined ? [] : Array.isArray(children) ? children : [children],
	};
};
const allowedTags = ["Svg", "Path", "G", "Circle", "Ellipse", "Line", "Rect", "Polygon", "Polyline"];
const elements = Object.fromEntries(allowedTags.map((tag) => [tag, tag]));
const provenance = createHash("sha256");
function readIcon(file) {
	const source = readFileSync(file, "utf8");
	provenance.update(source);
	// Evaluate only the installed package's self-contained generated SVG component, with
	// inert JSX factories: no renderer imports, network, or evaluation of user resume data.
	const rewritten = source
		.replace(/^import \{ ([^}]+) \} from "([^"]+)";$/gm, (_, bindings, specifier) => {
			const parameter =
				specifier === "react/jsx-runtime" ? "jsxRuntime" : specifier === "@react-pdf/renderer" ? "elements" : null;
			if (!parameter) throw new Error(`Unexpected icon import ${specifier}`);
			return `const { ${bindings.replaceAll(/\s+as\s+/g, ": ")} } = ${parameter};`;
		})
		.replace(/export \{ ([\w$]+) as \w+ \};/, "return $1;");
	const render = new Function("jsxRuntime", "elements", rewritten)({ jsx: element, jsxs: element }, elements);
	const svg = render({});
	if (svg.tag !== "Svg" || svg.props.viewBox !== "0 0 256 256") throw new Error(`Unexpected SVG in ${file}`);
	function verify(node) {
		if (!allowedTags.includes(node.tag)) throw new Error(`Unsupported SVG element ${node.tag}`);
		node.children.forEach(verify);
	}
	svg.children.forEach(verify);
	return svg.children;
}
const all = {};
for (const [name, file] of [...names].sort(([a], [b]) => a.localeCompare(b, "en"))) {
	const wrapper = readFileSync(join(installed, "icons", file), "utf8");
	const variants = [...wrapper.matchAll(/from "\.\.\/([^/]+)\/([^"]+)"/g)];
	if (variants.length !== weights.length) throw new Error(`Missing weight for ${name}`);
	const data = {};
	for (const weight of weights) {
		const match = variants.find((m) => m[1] === weight);
		if (!match) throw new Error(`Missing ${name}/${weight}`);
		data[weight] = readIcon(join(installed, weight, match[2]));
	}
	all[name] = data;
}
const outputs = new Map();
outputs.set("core.json", `${JSON.stringify(Object.fromEntries([...core].sort().map((name) => [name, all[name]])))}\n`);
const iconShards = {};
const shards = [];
let pending = {};
let bytes = 2;
function flush() {
	if (!Object.keys(pending).length) return;
	const name = `shard-${String(shards.length).padStart(3, "0")}`;
	shards.push(name);
	for (const icon of Object.keys(pending)) iconShards[icon] = name;
	outputs.set(`${name}.json`, `${JSON.stringify(pending)}\n`);
	pending = {};
	bytes = 2;
}
for (const [name, data] of Object.entries(all)) {
	if (core.has(name)) continue;
	const size = Buffer.byteLength(JSON.stringify({ [name]: data }));
	if (bytes + size > 96 * 1024) flush();
	pending[name] = data;
	bytes += size;
}
flush();
outputs.set("names.json", `${JSON.stringify(iconShards)}\n`);
outputs.set(
	"registry.ts",
	[
		"// Generated by tooling/generate-pdf-icons.mjs from phosphor-icons-react-pdf 0.1.3 (MIT).",
		'import type { PdfIconMap } from "../types";',
		'import names from "./names.json";',
		"",
		"export const iconShards: Record<string, string> = names;",
		"export const shardLoaders: Record<string, () => Promise<PdfIconMap>> = {",
		...shards.map(
			(name) => `\t"${name}": () => import("./${name}.json").then((module) => module.default as PdfIconMap),`,
		),
		"};",
		"",
	].join("\n"),
);
outputs.set(
	"provenance.json",
	`${JSON.stringify(
		{
			package: "phosphor-icons-react-pdf",
			version: "0.1.3",
			license: "MIT",
			sourceSha256: provenance.digest("hex"),
			icons: names.size,
			core: [...core].sort(),
			shards: shards.length,
		},
		null,
		2,
	)}\n`,
);
const phosphorLicense = readFileSync(join(root, "apps/web/node_modules/@phosphor-icons/react/LICENSE"), "utf8");
outputs.set(
	"LICENSE.txt",
	"Vector data from phosphor-icons-react-pdf 0.1.3 by Amruth Pillai (MIT), based on Phosphor Icons.\n\n" +
		phosphorLicense,
);
if (!check) mkdirSync(out, { recursive: true });
for (const [name, content] of outputs) {
	const path = join(out, name);
	if (check) {
		if (!existsSync(path) || readFileSync(path, "utf8") !== content)
			throw new Error(`Generated icon data differs: ${name}`);
	} else writeFileSync(path, content);
}
console.log(
	JSON.stringify({
		checked: check,
		icons: names.size,
		core: core.size,
		shards: shards.length,
		totalBytes: [...outputs.values()].reduce((n, s) => n + Buffer.byteLength(s), 0),
	}),
);
