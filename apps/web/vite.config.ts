import type { ProxyOptions } from "vite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pdfjsAssetsPlugin } from "./pdfjs-assets.ts";

const rootPackageJsonPath = new URL("../../package.json", import.meta.url);
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf-8")) as { version: string | undefined };
const appVersion = JSON.stringify(rootPackageJson.version ?? "0.0.0");
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
// The icon font belongs to the existing UI dependency; expose only its lazy stylesheet.
const uiRequire = createRequire(createRequire(import.meta.url).resolve("@reactive-resume/ui/globals.css"));
const phosphorWebCss = uiRequire.resolve("@phosphor-icons/web/regular/style.css");

const serverPaths = ["/api", "/mcp", "/uploads", "/.well-known", "/schema.json"] as const;

const serverProxy = serverPaths.reduce(
	(acc, path) => {
		acc[path] = {
			target: `http://localhost:${process.env.SERVER_PORT ?? "3001"}`,
			changeOrigin: true,
		};
		return acc;
	},
	{} as Record<string, ProxyOptions>,
);

export default defineConfig({
	envDir: workspaceRoot,

	resolve: {
		alias: { "@phosphor-icons/web/regular/style.css": phosphorWebCss },
		tsconfigPaths: true,
		// UI is source-consumed; its Lingui macros must use the app's active i18n singleton.
		dedupe: ["@lingui/core"],
	},

	define: {
		__APP_VERSION__: appVersion,
	},

	build: {
		chunkSizeWarningLimit: 1500,
		manifest: true,
		rolldownOptions: {
			external: ["bcrypt", "sharp", "@aws-sdk/client-s3", "ioredis", "linkedom"],
			output: {
				codeSplitting: {
					includeDependenciesRecursively: false,
					groups: [
						// Group only the actual bootstrap dependency graph. Grouping an entire
						// vendor package also hoists lazy editor/dialog dependencies into `/`.
						{ name: "app-bootstrap", tags: ["$initial"], priority: 10 },
						{
							// The homepage is a router-lazy entry. Consolidate its static graph too,
							// leaving editor, export and other dynamic imports behind their boundaries.
							name: (id, context) => {
								const pending = [id];
								const visited = new Set<string>();
								while (pending.length) {
									const current = pending.pop();
									if (current === undefined) break;
									if (visited.has(current)) continue;
									visited.add(current);
									if (
										/[\\/]src[\\/]routes[\\/]_home[\\/](?:index|route)\.tsx\?tsr-split=component/.test(current) ||
										/[\\/]features[\\/]home-motion[\\/]hero-engine\.ts$/.test(current)
									)
										return "homepage";
									pending.push(...(context.getModuleInfo(current)?.importers ?? []));
								}
								return null;
							},
						},
					],
				},
			},
		},
	},

	server: {
		host: true,
		strictPort: true,
		port: Number.parseInt(process.env.PORT ?? "3000", 10),
		proxy: serverProxy,
	},

	plugins: [
		pdfjsAssetsPlugin(),
		{
			name: "cloudflare-rocket-loader-bootstrap",
			transformIndexHtml: {
				order: "post",
				handler: (html) =>
					html.replace(
						/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/assets\/[^"]+")(?![^>]*\bdata-cfasync=)[^>]*>/g,
						(script) => script.replace('src="', 'data-cfasync="false" src="'),
					),
			},
		},
		devtools(),
		tailwindcss(),
		tanstackRouter({
			target: "react",
			semicolons: true,
			quoteStyle: "double",
			autoCodeSplitting: true,
		}),
		viteReact(),
		lingui(),
		babel({
			presets: [reactCompilerPreset(), linguiTransformerBabelPreset()],
			// Keep compiling app source, and also Lingui macros in @reactive-resume/ui.
			exclude: /[\\/]node_modules(?![\\/]@reactive-resume[\\/]ui[\\/])(?![\\/]\.pnpm[\\/]@reactive-resume\+ui@)/,
		}),
	],
});
