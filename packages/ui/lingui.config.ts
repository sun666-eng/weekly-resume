import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// Catalogs stay in the web app. This file exists so the UI package's tests can compile
// Lingui macros. Do not extract from here while apps/web/locales is being edited elsewhere.
export default defineConfig({
	sourceLocale: "en-US",
	locales: ["en-US", "zh-CN"],
	fallbackLocales: {
		default: "en-US",
	},
	format: formatter({
		lineNumbers: false,
	}),
	catalogs: [
		{
			path: "<rootDir>/../../apps/web/locales/{locale}",
			include: ["src"],
		},
	],
});
