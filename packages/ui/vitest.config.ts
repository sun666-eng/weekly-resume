import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
// @boundaries-ignore root shared Vitest config
import { createVitestProjectConfig } from "../../vitest.shared.mts";

export default createVitestProjectConfig({
	name: "@reactive-resume/ui",
	dirname: fileURLToPath(new URL(".", import.meta.url)),
	environment: "happy-dom",
	plugins: [lingui(), babel({ presets: [linguiTransformerBabelPreset()] })],
	extraSetupFiles: ["./vitest.setup.ts"],
});
