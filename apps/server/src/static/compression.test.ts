import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("@reactive-resume/env/server", () => ({ env: { APP_URL: "http://fixture.invalid" } }));
const { createWebDistStatic, handleWebApp } = await import("./web");
const source = "export const test = 'synthetic static payload';\n".repeat(30);
const htmlFixture =
	"<!doctype html><html><head><title>Fixture</title></head><body>temporary HTML fixture</body></html>";
let root: string;
const app = new Hono();

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "weekly-resume-compression-"));
	await writeFile(join(root, "index.html"), htmlFixture);
	for (const folder of ["assets", "fonts", "pdfjs"]) await mkdir(join(root, folder));
	for (const file of [
		"assets/test.js",
		"assets/test.css",
		"assets/test.svg",
		"assets/test.json",
		"fonts/test.ttf",
		"pdfjs/test.mjs",
	]) {
		await writeFile(join(root, file), source);
		await writeFile(join(root, `${file}.br`), brotliCompressSync(source));
		await writeFile(join(root, `${file}.gz`), gzipSync(source));
	}
	await writeFile(join(root, "assets/plain.js"), source);
	await writeFile(join(root, "assets/gzip.js"), source);
	await writeFile(join(root, "assets/gzip.js.gz"), gzipSync(source));
	app.use("*", async (context, next) => {
		context.header("Vary", "Origin");
		await next();
	});
	app.use("*", createWebDistStatic(root));
	app.all("*", (context) => context.text("not static", 404));
});
afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("precompressed static HTTP responses", () => {
	it.each([
		["br, gzip", "br"],
		["gzip", "gzip"],
		["br;q=0, gzip;q=1", "gzip"],
		["gzip;q=1, br;q=0.3", "gzip"],
		["*;q=0.5", "br"],
		["BR, GZIP", "br"],
		["br;q=0, gzip;q=0", null],
		["identity", null],
		["br;q=invalid", null],
	] as const)("negotiates %s", async (accept, encoding) => {
		const response = await app.request("/assets/test.js", { headers: { "Accept-Encoding": accept } });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Encoding")).toBe(encoding);
		expect(response.headers.get("Vary")).toBe("Origin, Accept-Encoding");
		expect(response.headers.get("Content-Type")).toContain("javascript");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
		const bytes = Buffer.from(await response.arrayBuffer());
		expect(Number(response.headers.get("Content-Length"))).toBe(bytes.length);
		expect(
			(encoding === "br" ? brotliDecompressSync(bytes) : encoding === "gzip" ? gunzipSync(bytes) : bytes).toString(),
		).toBe(source);
	});
	it.each(["assets/test.css", "assets/test.svg", "assets/test.json", "fonts/test.ttf", "pdfjs/test.mjs"])(
		"preserves original MIME and cache policy for %s",
		async (path) => {
			const plain = await app.request(`/${path}`);
			const compressed = await app.request(`/${path}`, { headers: { "Accept-Encoding": "br" } });
			expect(compressed.headers.get("Content-Type")).toBe(plain.headers.get("Content-Type"));
			expect(compressed.headers.get("Content-Type")).not.toBe("application/octet-stream");
			expect(compressed.headers.get("Cache-Control")).toBe(
				path.startsWith("assets/")
					? "public, max-age=31536000, immutable"
					: "public, max-age=2592000, stale-while-revalidate=86400",
			);
			await plain.arrayBuffer();
			await compressed.arrayBuffer();
		},
	);
	it("serves matching HEAD headers without a body", async () => {
		const options = { headers: { "Accept-Encoding": "br" } };
		const get = await app.request("/assets/test.js", options);
		const head = await app.request("/assets/test.js", { ...options, method: "HEAD" });
		for (const header of ["Content-Type", "Content-Encoding", "Content-Length", "Vary", "Cache-Control"]) {
			expect(head.headers.get(header)).toBe(get.headers.get(header));
		}
		expect(await head.text()).toBe("");
		await get.arrayBuffer();
	});
	it("keeps byte ranges on the original uncompressed representation", async () => {
		const response = await app.request("/assets/test.js", {
			headers: { "Accept-Encoding": "br, gzip", Range: "bytes=0-9" },
		});
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Encoding")).toBeNull();
		expect(response.headers.get("Content-Range")).toBe(`bytes 0-9/${Buffer.byteLength(source)}`);
		expect(await response.text()).toBe(source.slice(0, 10));
	});
	it("falls back through available encodings and then identity", async () => {
		for (const [path, expected] of [
			["gzip", "gzip"],
			["plain", null],
		] as const) {
			const response = await app.request(`/assets/${path}.js`, { headers: { "Accept-Encoding": "br, gzip" } });
			expect(response.headers.get("Content-Encoding")).toBe(expected);
			await response.arrayBuffer();
		}
	});
	it.each(["/api/rpc/flags/get", "/api/rpc-stream", "/mcp", "/mcp/events", "/assets/missing.js"])(
		"does not intercept %s",
		async (path) => {
			const response = await app.request(path, { headers: { "Accept-Encoding": "br" } });
			expect(response.status).toBe(404);
			expect(response.headers.get("Content-Encoding")).toBeNull();
		},
	);
	it("does not serve assets for POST or traversal", async () => {
		expect((await app.request("/assets/test.js", { method: "POST" })).status).toBe(404);
		expect(
			(await app.request("/assets/%2e%2e%2f%2e%2e%2fsecret.js", { headers: { "Accept-Encoding": "br" } })).status,
		).toBe(404);
	});
});

describe("HTML-only dynamic compression", () => {
	it.each(["br", "gzip"])("compresses HTML using %s without changing its contents", async (encoding) => {
		const options = { indexHtmlPath: join(root, "index.html") };
		const plain = await handleWebApp(new Request("http://fixture.invalid/"), options);
		const compressed = await handleWebApp(
			new Request("http://fixture.invalid/", { headers: { "Accept-Encoding": encoding } }),
			options,
		);
		const plainHtml = await plain.text();
		expect(plainHtml).toContain("temporary HTML fixture");
		expect(compressed.headers.get("Content-Encoding")).toBe(encoding);
		expect(compressed.headers.get("Vary")).toContain("Accept-Encoding");
		const bytes = Buffer.from(await compressed.arrayBuffer());
		expect((encoding === "br" ? brotliDecompressSync(bytes) : gunzipSync(bytes)).toString()).toBe(plainHtml);
	});
	it.each(["/api/rpc/stream", "/mcp/events"])("never buffers streaming route %s", async (path) => {
		const response = await handleWebApp(
			new Request(`http://fixture.invalid${path}`, { headers: { "Accept-Encoding": "br" } }),
		);
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Encoding")).toBeNull();
	});
});
