import { fileURLToPath } from "node:url";
// @boundaries-ignore root shared Vitest config
import { createVitestProjectConfig } from "../../vitest.shared.mts";

const config = createVitestProjectConfig({
	name: "@reactive-resume/pdf",
	dirname: fileURLToPath(new URL(".", import.meta.url)),
	extraSetupFiles: ["vitest.fonts.setup.ts"],
});

export default {
	...config,
	// Rendering and rasterizing real PDFs is far slower than Vitest's 5s default: the all-template
	// date characterization renders 15 templates in one test, and the picture-fit override case
	// rasterizes twice. Both land within a second or two of the default on a CI runner.
	test: {
		...config.test,
		testTimeout: 30_000,
		// Real PDF/font initialization is CPU- and memory-heavy. In particular, the killable
		// pagination probe cold-starts another Vitest process; bound competing imports by default.
		// Keep isolation and every render assertion. Callers can explicitly override maxWorkers.
		maxWorkers: 2,
	},
	oxc: { jsx: { runtime: "automatic" as const } },
};
