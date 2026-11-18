import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const root = new URL("../../", import.meta.url);
const faces = [];
const artifacts = [];
let verifiedCompressedFiles = 0;

for (const [family, weights] of [
	["noto-sans-sc", [400, 500, 600, 700]],
	["noto-serif-sc", [400, 700]],
]) {
	for (const weight of weights) {
		const sizes = { family, weight };
		for (const variant of ["full", "subset"]) {
			const filename = `${weight}${variant === "subset" ? ".subset" : ""}.ttf`;
			const source = readFileSync(new URL(`apps/web/public/fonts/${family}/${filename}`, root));
			const path = `apps/web/dist/fonts/${family}/${filename}`;
			const built = readFileSync(new URL(path, root));
			assert.deepEqual(built, source, `Build/source mismatch: ${path}`);
			for (const [suffix, decompress] of [
				["", null],
				[".br", brotliDecompressSync],
				[".gz", gunzipSync],
			]) {
				const artifactPath = `${path}${suffix}`;
				const bytes = suffix ? readFileSync(new URL(artifactPath, root)) : built;
				if (decompress) {
					assert.deepEqual(decompress(bytes), source, `Decompression mismatch: ${artifactPath}`);
					verifiedCompressedFiles++;
				}
				sizes[`${variant}${suffix || ".ttf"}`] = bytes.length;
				artifacts.push({
					path: artifactPath,
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				});
			}
		}
		faces.push(sizes);
	}
}

console.log(JSON.stringify({ verifiedCompressedFiles, faces, artifacts }, null, "\t"));
