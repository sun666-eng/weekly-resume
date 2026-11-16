import type { ComponentType, ReactNode } from "react";
import type { PdfIconWeight } from "./types";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { act, createElement, isValidElement } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Document, Page, renderToBuffer, View } from "#react-pdf-renderer";
import { rasterizePdf } from "../../../semantic/test/rasterize-pdf";
import { PdfIcon, preloadResumePdfIcons } from ".";
import { iconShards, shardLoaders } from "./generated/registry";

const require = createRequire(import.meta.url);
const weights: PdfIconWeight[] = ["thin", "light", "regular", "bold", "fill", "duotone"];
const icons = [
	["acorn", "Acorn"],
	["github-logo", "GithubLogo"],
	["arrow-bend-up-left", "ArrowBendUpLeft"],
	["yin-yang", "YinYang"],
	["person-simple-walk", "PersonSimpleWalk"],
] as const;
type OriginalIcon = ComponentType<{ color: string; size: number; weight?: PdfIconWeight }>;
const originals = new Map<string, OriginalIcon>();

function tree(node: ReactNode): unknown {
	if (!isValidElement(node)) return node;
	const { children, ...props } = node.props as { children?: ReactNode };
	return {
		type: node.type,
		props,
		children: (Array.isArray(children) ? children : children ? [children] : []).map(tree),
	};
}

describe("sharded PDF icons", () => {
	it("preloads custom shards once and preserves the original six-weight vector trees", async () => {
		const data = structuredClone(defaultResumeData);
		data.basics.customFields = icons.map(([name]) => ({ id: name, icon: name, text: name, link: "" }));
		const input = JSON.stringify(data);
		const counts = new Map<string, number>();
		for (const shard of new Set(icons.map(([name]) => iconShards[name]))) {
			if (!shard) continue;
			const load = shardLoaders[shard];
			if (!load) throw new Error(`Missing icon fixture loader: ${shard}`);
			shardLoaders[shard] = () => {
				counts.set(shard, (counts.get(shard) ?? 0) + 1);
				return load();
			};
		}
		await Promise.all([preloadResumePdfIcons(data), preloadResumePdfIcons(data)]);
		await preloadResumePdfIcons(data);
		expect([...counts.values()].every((count) => count === 1)).toBe(true);
		expect(counts.size).toBeGreaterThan(0);
		expect(JSON.stringify(data)).toBe(input);
		for (const [name, exported] of icons) {
			for (const weight of weights) {
				const url = pathToFileURL(
					require.resolve(`phosphor-icons-react-pdf/${weight}/${exported}`).replace(/\.cjs\.js$/, ".es.js"),
				).href;
				const module = await import(/* @vite-ignore */ url);
				const Original = module[`${exported}Icon`];
				originals.set(`${name}:${weight}`, Original);
				expect(tree(PdfIcon({ name, weight, size: 24, color: "#143ac6" }))).toEqual(
					tree(Original({ size: 24, color: "#143ac6" })),
				);
			}
		}
		expect(PdfIcon({ name: "unknown-icon" })).toBeNull();
	});

	it("renders identical pixels for core/custom icons at every weight", async () => {
		function document(original: boolean) {
			function originalIcon(name: string, weight: PdfIconWeight) {
				const component = originals.get(`${name}:${weight}`);
				if (!component) throw new Error(`Missing original icon fixture: ${name}/${weight}`);
				return createElement(component, { size: 24, color: "#143ac6" });
			}
			return (
				<Document>
					<Page size={[420, 240]} style={{ padding: 18 }}>
						{icons.map(([name]) => (
							<View key={name} style={{ flexDirection: "row", marginBottom: 6 }}>
								{weights.map((weight) => (
									<View key={weight} style={{ width: 55, height: 32 }}>
										{original ? (
											originalIcon(name, weight)
										) : (
											<PdfIcon name={name} weight={weight} size={24} color="#143ac6" />
										)}
									</View>
								))}
							</View>
						))}
					</Page>
				</Document>
			);
		}
		const before = await act(() => renderToBuffer(document(true)));
		const after = await act(() => renderToBuffer(document(false)));
		const beforePages = await rasterizePdf(new Uint8Array(before));
		const afterPages = await rasterizePdf(new Uint8Array(after));
		expect(afterPages).toHaveLength(beforePages.length);
		expect(afterPages.map((page) => createHash("sha256").update(page.data).digest("hex"))).toEqual(
			beforePages.map((page) => createHash("sha256").update(page.data).digest("hex")),
		);
		if (process.env.PDF_TEST_ARTIFACT_DIR) {
			const output = join(process.env.PDF_TEST_ARTIFACT_DIR, "pdf-icons");
			mkdirSync(output, { recursive: true });
			writeFileSync(`${output}/before.pdf`, before);
			writeFileSync(`${output}/after.pdf`, after);
		}
	});
});
