import type { Context, MiddlewareHandler } from "hono";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { serveStatic } from "@hono/node-server/serve-static";
import { getMimeType } from "hono/utils/mime";
import { env } from "@reactive-resume/env/server";
import { APP_NAME } from "@reactive-resume/utils/brand";

function resolveWebDistPath() {
	const candidates = [
		// Source layout: apps/server/src/static/web.ts -> apps/web/dist
		fileURLToPath(new URL("../../../web/dist", import.meta.url)),
		// Bundled layout: apps/server/dist/index.mjs -> apps/web/dist
		fileURLToPath(new URL("../../web/dist", import.meta.url)),
	];
	const [fallback] = candidates;
	if (!fallback) throw new Error("Could not resolve web dist path");

	return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const staticRoot = resolveWebDistPath();
const indexHtmlPath = `${staticRoot}/index.html`;
const noindexShellPrefixes = ["/auth", "/dashboard", "/builder", "/local-draft", "/agent", "/templates"];
/**
 * Marketing pages the SPA owns that search engines should index.
 *
 * Without an entry here the fallback below returns 404 for the path in production — the dev Vite
 * server serves the shell for anything, so this failure only ever shows up once deployed.
 */
const indexableAppPaths = new Set(["/ats-checker"]);
const reservedPublicResumeSegments = new Set([
	"api",
	"mcp",
	".well-known",
	"uploads",
	"auth",
	"dashboard",
	"builder",
	"agent",
	"templates",
	"ats-checker",
]);

function isAssetPath(pathname: string): boolean {
	return pathname.split("/").pop()?.includes(".") ?? false;
}

function getPathSegments(pathname: string) {
	return pathname.split("/").filter(Boolean);
}

function isNoindexShellPath(pathname: string): boolean {
	return noindexShellPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicResumePath(pathname: string): boolean {
	const segments = getPathSegments(pathname);
	const [firstSegment] = segments;

	return segments.length === 2 && firstSegment !== undefined && !reservedPublicResumeSegments.has(firstSegment);
}

const BASE_SECURITY_HEADERS = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Content-Security-Policy-Report-Only":
		"default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

const ROOT_TITLE = `${APP_NAME} — A free and open-source resume builder`;
// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
const ROOT_DESCRIPTION =
	"Free, open-source resume builder. Create, update, and share your resume, with no ads and no paywall.";
const ROOT_FAQ_ITEMS = [
	{
		question: `Is ${APP_NAME} really free?`,
		answer: `Yes. ${APP_NAME} is free to use, with no hidden costs, premium tiers, or subscription fees.`,
	},
	{
		question: "How is my data protected?",
		answer: "Your data is stored securely and never shared with third parties.",
	},
	{
		question: "Can I export my resume to PDF?",
		answer: "Yes. One click exports your resume to PDF, with your formatting and styling intact.",
	},
	{
		question: `Is ${APP_NAME} available in multiple languages?`,
		answer: "Yes. Pick your language on the settings page, or with the language switcher in the top right corner.",
	},
	{
		question: `What makes ${APP_NAME} different from other resume builders?`,
		answer: `${APP_NAME} is private and free. It shows no ads, doesn't track what you do, and doesn't lock features behind a paywall.`,
	},
	{
		question: "How do I share my resume?",
		answer: "Share it with a public URL, put a password on that URL, or download the PDF and send it yourself.",
	},
] as const;

function createRootSeoMarkup(canonicalUrl: string) {
	const origin = new URL(canonicalUrl).origin;
	const imageUrl = `${origin}/opengraph/banner.jpg`;
	const structuredData = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				name: APP_NAME,
				url: canonicalUrl,
			},
			{
				"@type": ["SoftwareApplication", "WebApplication"],
				name: APP_NAME,
				url: canonicalUrl,
				description: ROOT_DESCRIPTION,
				applicationCategory: "BusinessApplication",
				operatingSystem: "Web",
				isAccessibleForFree: true,
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
				},
			},
			{
				"@type": "Project",
				name: APP_NAME,
				url: canonicalUrl,
			},
			{
				"@type": "FAQPage",
				mainEntity: ROOT_FAQ_ITEMS.map((item) => ({
					"@type": "Question",
					name: item.question,
					acceptedAnswer: {
						"@type": "Answer",
						text: item.answer,
					},
				})),
			},
		],
	};

	return `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="website">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${ROOT_TITLE}">
		<meta property="og:description" content="${ROOT_DESCRIPTION}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${ROOT_TITLE}">
		<meta name="twitter:description" content="${ROOT_DESCRIPTION}">
		<meta name="twitter:image" content="${imageUrl}">
		<script id="weekly-resume-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>
	`;
}

const ATS_CHECKER_TITLE = `ATS Checker - ${APP_NAME}`;
// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
const ATS_CHECKER_DESCRIPTION =
	"Check whether software can read your resume PDF. Runs entirely in your browser, so your file is never uploaded.";

function createAtsCheckerSeoMarkup(origin: string) {
	const canonicalUrl = `${origin}/ats-checker`;
	const imageUrl = `${origin}/opengraph/ats-checker.png`;
	const structuredData = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: "ATS Checker",
		url: canonicalUrl,
		description: ATS_CHECKER_DESCRIPTION,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		isAccessibleForFree: true,
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		isPartOf: { "@type": "WebSite", name: APP_NAME, url: `${origin}/` },
	};

	return `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="website">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${ATS_CHECKER_TITLE}">
		<meta property="og:description" content="${ATS_CHECKER_DESCRIPTION}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${ATS_CHECKER_TITLE}">
		<meta name="twitter:description" content="${ATS_CHECKER_DESCRIPTION}">
		<meta name="twitter:image" content="${imageUrl}">
		<script id="ats-checker-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>
	`;
}

// Resume names, headlines, and summaries are user-authored, so they must never reach the served
// HTML unescaped.
const escapeAttribute = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

async function createPublicResumeSeoMarkup(pathname: string, origin: string) {
	const [username, slug] = getPathSegments(pathname);
	if (!username || !slug) return null;

	// A card render must never take down the page: any lookup failure falls back to the plain shell.
	const meta = await import("@reactive-resume/api/features/resume/social-meta")
		.then((module) => module.getPublicResumeSocialMeta({ username, slug }))
		.catch(() => null);
	if (!meta) return null;

	const canonicalUrl = `${origin}/${username}/${slug}`;
	const imageUrl = `${origin}/opengraph/banner.jpg`;
	const pageTitle = escapeAttribute(`${meta.name} - ${APP_NAME}`);
	const title = escapeAttribute(meta.title);
	const description = escapeAttribute(meta.description);

	return {
		pageTitle,
		description,
		markup: `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="profile">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${title}">
		<meta property="og:description" content="${description}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${title}">
		<meta name="twitter:description" content="${description}">
		<meta name="twitter:image" content="${imageUrl}">
	`,
	};
}

type Encoding = "br" | "gzip";
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const isStreamingPath = (path: string) => path.startsWith("/api/rpc") || path.startsWith("/mcp");
const isCompressibleAsset = (path: string) =>
	/^\/assets\/.*\.(?:js|css|svg|json)$/.test(path) ||
	/^\/pdfjs\/.*\.(?:mjs|js|css)$/.test(path) ||
	/^\/fonts\/.*\.ttf$/.test(path);

function acceptedEncodings(header: string | null): Encoding[] {
	if (!header) return [];
	const quality = new Map<string, number>();
	for (const item of header.toLowerCase().split(",")) {
		const [name, ...parameters] = item.trim().split(";");
		const q = parameters
			.find((parameter) => parameter.trim().startsWith("q="))
			?.trim()
			.slice(2);
		const value = q === undefined ? 1 : Number(q);
		if (name) quality.set(name.trim(), Number.isFinite(value) && value > 0 && value <= 1 ? value : 0);
	}
	const score = (encoding: string) => quality.get(encoding) ?? quality.get("*") ?? 0;
	return (["br", "gzip"] as Encoding[]).filter((encoding) => score(encoding) > 0).sort((a, b) => score(b) - score(a));
}

function varyByEncoding(headers: Headers) {
	const vary = headers.get("Vary");
	if (!vary?.split(",").some((value) => ["*", "accept-encoding"].includes(value.trim().toLowerCase()))) {
		headers.set("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
	}
}

function staticCacheHeaders(path: string, context: Context) {
	if (path.startsWith("/assets/") || /^\/videos\/.*-v\d+\.(?:mp4|webp)$/.test(path)) {
		context.header("Cache-Control", "public, max-age=31536000, immutable");
	} else if (path.startsWith("/pdfjs/") || path.startsWith("/fonts/")) {
		context.header("Cache-Control", "public, max-age=2592000, stale-while-revalidate=86400");
	}
	if (isCompressibleAsset(path)) {
		const headers = new Headers(context.res.headers);
		varyByEncoding(headers);
		context.header("Vary", headers.get("Vary") ?? "Accept-Encoding");
	}
}

/** A root parameter allows real filesystem HTTP tests without loading the application/database. */
export function createWebDistStatic(root = staticRoot): MiddlewareHandler {
	const absoluteRoot = resolve(root);
	const uncompressed = serveStatic({
		root,
		onFound: (_path, context) => staticCacheHeaders(context.req.path, context),
	});
	return async (context, next) => {
		if (!["GET", "HEAD"].includes(context.req.method) || isStreamingPath(context.req.path)) return next();
		let path: string;
		try {
			path = decodeURIComponent(context.req.path);
		} catch {
			return next();
		}
		if (!context.req.header("Range") && isCompressibleAsset(path) && !path.includes("\\") && !path.includes("\0")) {
			const original = resolve(absoluteRoot, `.${path}`);
			if (original.startsWith(`${absoluteRoot}${sep}`) && (await fs.stat(original).catch(() => null))?.isFile()) {
				for (const encoding of acceptedEncodings(context.req.header("Accept-Encoding") ?? null)) {
					const sidecar = `${original}.${encoding === "br" ? "br" : "gz"}`;
					const stat = await fs.stat(sidecar).catch(() => null);
					if (!stat?.isFile()) continue;
					staticCacheHeaders(path, context);
					context.header("Content-Encoding", encoding);
					context.header("Content-Type", getMimeType(path) ?? "application/octet-stream");
					context.header("Content-Length", String(stat.size));
					context.header("Last-Modified", stat.mtime.toUTCString());
					if (context.req.method === "HEAD") return context.body(null);
					const file = await fs.open(sidecar, "r");
					return new Response(file.readableWebStream({ autoClose: true }) as unknown as ReadableStream<Uint8Array>, {
						headers: context.res.headers,
					});
				}
			}
		}
		return uncompressed(context, next);
	};
}

export const serveWebDistStatic = createWebDistStatic();

async function htmlResponse(request: Request, html: string, initialHeaders: HeadersInit) {
	const headers = new Headers(initialHeaders);
	varyByEncoding(headers);
	const encoding =
		request.method === "GET" && !request.headers.has("Range") && !isStreamingPath(new URL(request.url).pathname)
			? acceptedEncodings(request.headers.get("Accept-Encoding"))[0]
			: undefined;
	if (!encoding) return new Response(html, { headers });
	const bytes =
		encoding === "br"
			? await brotliAsync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
			: await gzipAsync(html, { level: 6 });
	headers.set("Content-Encoding", encoding);
	headers.set("Content-Length", String(bytes.length));
	return new Response(new Uint8Array(bytes), { headers });
}

function getFallbackResponseHeaders(pathname: string) {
	if (pathname === "/" && env.ROOT_RESUME_ID?.trim()) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			"Cache-Control": "private, no-store",
			...BASE_SECURITY_HEADERS,
		};
	}
	if (pathname === "/" || indexableAppPaths.has(pathname)) {
		return { "Content-Type": "text/html; charset=UTF-8", ...BASE_SECURITY_HEADERS };
	}
	if (isNoindexShellPath(pathname) || isPublicResumePath(pathname)) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			...BASE_SECURITY_HEADERS,
		};
	}

	return null;
}

function notFoundResponse(options: { head?: boolean; noindex?: boolean } = {}) {
	const headers = new Headers({ "Content-Type": "text/plain; charset=UTF-8" });
	if (options.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");

	return new Response(options.head ? null : "Not Found", {
		status: 404,
		headers,
	});
}

// ponytail: GET and HEAD share the same routing logic; method determines body presence
export async function handleWebApp(request: Request, options: { indexHtmlPath?: string } = {}) {
	const isHead = request.method === "HEAD";
	const pathname = new URL(request.url).pathname;
	if (isStreamingPath(pathname)) return notFoundResponse({ head: isHead, noindex: true });

	if (!isNoindexShellPath(pathname) && isAssetPath(pathname)) {
		return new Response(isHead ? null : "Not Found", { status: 404 });
	}

	const headers = getFallbackResponseHeaders(pathname);
	if (!headers) return notFoundResponse({ head: isHead, noindex: true });

	if (isHead) return new Response(null, { status: 200, headers: { ...headers, Vary: "Accept-Encoding" } });

	const html = await fs.readFile(options.indexHtmlPath ?? indexHtmlPath, "utf-8");
	const canonicalUrl = new URL("/", env.APP_URL).toString();

	if (pathname === "/" && env.ROOT_RESUME_ID?.trim()) {
		// Root configuration never discloses a target in the HTML shell. The public API
		// gates data and browser metadata; shell requests must not count extra views.
		const shell = html
			.replace(/<title>[^<]*<\/title>/, `<title>${APP_NAME}</title>`)
			.replace(/<meta\s+name="description"[^>]*>/, '<meta name="description" content="">');
		const markup = `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" data-root-resume-shell><meta name="robots" content="noindex, follow" data-root-resume-shell>`;
		return htmlResponse(request, shell.replace("</head>", `${markup}</head>`), headers);
	}

	if (pathname === "/") {
		return htmlResponse(request, html.replace("</head>", `${createRootSeoMarkup(canonicalUrl)}</head>`), headers);
	}

	if (pathname === "/ats-checker") {
		const origin = new URL(env.APP_URL).origin;
		const withTitle = html
			.replace(/<title>[^<]*<\/title>/, `<title>${ATS_CHECKER_TITLE}</title>`)
			.replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${ATS_CHECKER_DESCRIPTION}">`);

		return htmlResponse(request, withTitle.replace("</head>", `${createAtsCheckerSeoMarkup(origin)}</head>`), headers);
	}

	if (isPublicResumePath(pathname)) {
		const resumeSeo = await createPublicResumeSeoMarkup(pathname, new URL(env.APP_URL).origin);
		if (resumeSeo) {
			// The shell's generic title/description are replaced so shares and previews show the resume,
			// not the marketing copy baked into index.html.
			const withTitle = html
				.replace(/<title>[^<]*<\/title>/, `<title>${resumeSeo.pageTitle}</title>`)
				.replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${resumeSeo.description}">`);

			return htmlResponse(request, withTitle.replace("</head>", `${resumeSeo.markup}</head>`), headers);
		}
	}

	return htmlResponse(request, html, headers);
}
