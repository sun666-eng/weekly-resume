import { resolve } from "node:path";
import { vi } from "vitest";

const publicFontsDirectory = resolve(process.cwd(), "..", "apps", "web", "public", "fonts");

// The browser resolves bundled fonts from /fonts, while the node PDF renderer
// needs the corresponding files on disk during tooling integration tests.
vi.mock("@reactive-resume/fonts", async (importOriginal) => {
	const original = await importOriginal<typeof import("@reactive-resume/fonts")>();
	return {
		...original,
		getWebFontSource: (...args: Parameters<typeof original.getWebFontSource>) => {
			const source = original.getWebFontSource(...args);
			const resolved = source?.startsWith("/fonts/")
				? resolve(publicFontsDirectory, source.slice("/fonts/".length))
				: source;
			return resolved;
		},
	};
});
