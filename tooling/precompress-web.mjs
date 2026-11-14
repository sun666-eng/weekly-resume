import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const groups = [
	["assets", /\.(?:js|css|svg|json)$/],
	["pdfjs", /\.(?:mjs|js|css)$/],
	["fonts", /\.ttf$/],
];
let files = 0;
let raw = 0;
let brotli = 0;
let gzip = 0;
function compressDirectory(directory, pattern) {
	for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) compressDirectory(path, pattern);
		else if (entry.isFile() && pattern.test(entry.name)) {
			const bytes = readFileSync(path);
			const br = brotliCompressSync(bytes, {
				params: { [constants.BROTLI_PARAM_QUALITY]: path.endsWith(".ttf") ? 5 : 9 },
			});
			const gz = gzipSync(bytes, { level: 9 });
			writeFileSync(`${path}.br`, br);
			writeFileSync(`${path}.gz`, gz);
			files++;
			raw += bytes.length;
			brotli += br.length;
			gzip += gz.length;
		}
	}
}
for (const [directory, pattern] of groups) compressDirectory(join(root, directory), pattern);
console.log(
	`Precompressed ${files} files in ${relative(process.cwd(), root)}: ${raw} raw, ${brotli} br, ${gzip} gzip bytes`,
);
