import type { Plugin } from "vite";
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Same-origin auxiliary PDF.js assets in both Vite dev and the deployed web dist. */
export function pdfjsAssetsPlugin(): Plugin {
	const packagePath = createRequire(import.meta.url).resolve("pdfjs-dist/package.json");
	const { version } = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
	const packageRoot = dirname(packagePath);
	const files = new Map<string, string>();
	let building = false;
	for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
		for (const name of readdirSync(join(packageRoot, directory))) {
			if (!/\.(?:bcmap|pfb|ttf|wasm|js)$/.test(name)) continue;
			files.set(`pdfjs/${version}/${directory}/${name}`, join(packageRoot, directory, name));
		}
	}
	return {
		name: "pdfjs-local-assets",
		configResolved(config) {
			building = config.command === "build";
		},
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
				const key = pathname.slice(server.config.base.length);
				const file = files.get(key);
				if (!file || !["GET", "HEAD"].includes(request.method ?? "GET")) return next();
				response.setHeader(
					"Content-Type",
					file.endsWith(".wasm")
						? "application/wasm"
						: file.endsWith(".js")
							? "text/javascript"
							: "application/octet-stream",
				);
				if (request.method === "HEAD") return response.end();
				createReadStream(file).pipe(response);
			});
		},
		buildStart() {
			if (!building) return;
			for (const [fileName, path] of files) this.emitFile({ type: "asset", fileName, source: readFileSync(path) });
		},
	};
}
