import { fileURLToPath } from "node:url";
import { vi } from "vitest";

// Node's real PDF renderer needs a filesystem path where the browser uses a same-origin URL.
// Keep the actual font bytes and rendering/layout assertions; only adapt the asset root.
vi.mock("@reactive-resume/fonts", async (importOriginal) => {
	const original = await importOriginal<typeof import("@reactive-resume/fonts")>();
	return {
		...original,
		getWebFontSource: (...args: Parameters<typeof original.getWebFontSource>) => {
			const source = original.getWebFontSource(...args);
			return source?.startsWith("/fonts/")
				? fileURLToPath(new URL(`../../apps/web/public${source}`, import.meta.url))
				: source;
		},
	};
});
