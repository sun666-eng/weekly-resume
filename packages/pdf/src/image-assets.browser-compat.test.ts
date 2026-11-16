import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Exercise the installed dependency, with browser globals, rather than checking patch text.
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(require.resolve("@react-pdf/renderer"));
const layoutSource = readFileSync(rendererRequire.resolve("@react-pdf/layout"), "utf8");
const fetchImageSource = layoutSource.match(/const fetchImage = async[\s\S]*?\n};/)?.[0];
if (!fetchImageSource) throw new Error("Installed layout image resolver not found");

function browserResolver(globals: Record<string, unknown> = {}) {
	const warn = vi.fn();
	const resolveImage = vi.fn(async () => ({ width: 300, height: 400 }));
	const fetchImage = runInNewContext(`${fetchImageSource}; fetchImage`, {
		getSource: (node: { props: { src: unknown } }) => node.props.src,
		resolveSource: async (src: unknown) => (typeof src === "string" ? { uri: src } : src),
		resolveImage,
		console: { warn },
		...globals,
	}) as (
		node: { props: { src: unknown; cache: boolean }; image?: { key?: string } | undefined },
		pageWidth: number,
	) => Promise<void>;
	return { fetchImage, warn, resolveImage };
}

describe("PDF image assets without Node globals", () => {
	it.each(["/api/uploads/portrait.png", "data:image/png;base64,fixture"])(
		"loads %s without Buffer or Blob",
		async (src) => {
			const { fetchImage, warn } = browserResolver();
			const node = { props: { src, cache: false }, image: undefined as { key?: string } | undefined };
			await fetchImage(node, 595);
			expect(node.image?.key).toBe(src);
			expect(warn).not.toHaveBeenCalled();
		},
	);
	it("keeps browser Blob images without assigning a URL key", async () => {
		const { fetchImage, warn } = browserResolver({ Blob });
		const node = {
			props: { src: new Blob(["fixture"]), cache: true },
			image: undefined as { key?: string } | undefined,
		};
		await fetchImage(node, 595);
		expect(node.image).toEqual({ width: 300, height: 400 });
		expect(warn).not.toHaveBeenCalled();
	});
	it("keeps Node buffer compatibility", async () => {
		const { fetchImage, warn } = browserResolver({ Buffer });
		const node = {
			props: { src: Buffer.from("fixture"), cache: true },
			image: undefined as { key?: string } | undefined,
		};
		await fetchImage(node, 595);
		expect(node.image?.key).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});
	it("still reports a real image failure", async () => {
		const { fetchImage, warn, resolveImage } = browserResolver();
		resolveImage.mockRejectedValueOnce(new Error("Invalid PNG"));
		await fetchImage({ props: { src: "broken.png", cache: false } }, 595);
		expect(warn).toHaveBeenCalledExactlyOnceWith("Invalid PNG");
	});
});
