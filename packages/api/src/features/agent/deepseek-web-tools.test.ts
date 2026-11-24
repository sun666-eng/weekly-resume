import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekWebTools } from "./deepseek-web-tools";

const transport = vi.fn<typeof fetch>();
const execution = { toolCallId: "research", messages: [], context: {} };
const query = { query: "public job description", count: 5 };
const page = { url: "https://careers.example/jobs/123" };
const key = "synthetic-personal";
const neutral = "Web research is temporarily unavailable. Continue using the resume and conversation context.";

beforeEach(() => {
	transport.mockReset();
	vi.stubGlobal("fetch", transport);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("DeepSeek web search", () => {
	it("exposes ordinary function names and descriptions for relay compatibility", () => {
		const tools = buildDeepSeekWebTools(key);
		expect(Object.keys(tools)).toEqual(["lookup_online_sources", "read_public_url"]);
		for (const candidate of Object.values(tools)) {
			expect(candidate.execute).toBeTypeOf("function");
			expect(candidate.description).not.toMatch(/web_search|web_fetch/);
		}
	});

	it("uses the official endpoint, a Unicode query and default count, and only returns bounded public references", async () => {
		const title = "岗".repeat(301);
		const summary = "文".repeat(1601);
		transport.mockResolvedValue(
			Response.json({
				results: [
					{},
					{ url: null },
					{ url: "not a URL" },
					{ url: "http://127.0.0.1" },
					{ url: "https://name:pass@example.com" },
					{ url: page.url, title, summary: null, snippet: summary },
					{ url: page.url, title: null },
					{ url: page.url, summary: "", snippet: "fallback" },
					{ url: page.url, summary: "preferred", snippet: "unused" },
					{ url: page.url, title, snippet: null },
					{ url: "https://extra.example" },
				],
			}),
		);
		const term = "🧑".repeat(128);
		const tools = buildDeepSeekWebTools(key);
		const result = await tools.lookup_online_sources.execute({ query: term }, execution);
		expect(transport).toHaveBeenCalledExactlyOnceWith(
			"https://api.deepseek.com/v1/tools/search",
			expect.objectContaining({
				method: "POST",
				headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
				redirect: "error",
				body: JSON.stringify({ query: term, count: 5, need_content: false }),
			}),
		);
		expect(result).toEqual({
			results: [
				{ url: page.url, title: "岗".repeat(300), summary: "文".repeat(1600), truncated: true },
				{ url: page.url, title: "", summary: "", truncated: false },
				{ url: page.url, title: "", summary: "fallback", truncated: false },
				{ url: page.url, title: "", summary: "preferred", truncated: false },
				{ url: page.url, title: "岗".repeat(300), summary: "", truncated: true },
			],
		});
	});

	it.each([1, 10])("requests and returns at most the specified count (%d)", async (count) => {
		transport.mockResolvedValue(
			Response.json({ results: Array.from({ length: 12 }, (_, i) => ({ url: `https://jobs.example/${i}` })) }),
		);
		const result = await buildDeepSeekWebTools(key).lookup_online_sources.execute({ query: "岗", count }, execution);
		expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ query: "岗", count, need_content: false }));
		expect(result).toMatchObject({
			results: expect.arrayContaining([{ url: "https://jobs.example/0", title: "", summary: "", truncated: false }]),
		});
		expect(result).toHaveProperty("results.length", count);
	});

	it.each([
		{ query: " " },
		{ query: "🧑".repeat(129) },
		{ ...query, count: 0 },
		{ ...query, count: 11 },
		{ ...query, count: 1.5 },
	])("rejects an out-of-range search without dispatching", async (input) => {
		await expect(buildDeepSeekWebTools(key).lookup_online_sources.execute(input, execution)).rejects.toThrow();
		expect(transport).not.toHaveBeenCalled();
	});
});

describe("DeepSeek web fetch", () => {
	it.each([
		"file:///local",
		"https://user:password@example.com",
		"http://printer",
		"http://localhost.",
		"http://printer.local.",
		"https://admin.internal",
		"http://10.1.2.3",
		"http://169.254.10.1",
		"http://[::1]/",
		"http://[::ffff:127.0.0.1]/",
		"http://[fd00::1]",
		"http://[fec0::1]",
		"http://sub.localhost",
		"http://printer.home.arpa",
		"http://host.internal..",
	])("rejects a non-public URL without sending it (%s)", async (url) => {
		await expect(buildDeepSeekWebTools(key).read_public_url.execute({ url }, execution)).rejects.toThrow("public HTTP");
		expect(transport).not.toHaveBeenCalled();
	});

	it("sends the page URL only to the official API and bounds the returned title and content", async () => {
		const url = "http://jobs.example/openings";
		transport.mockResolvedValue(
			Response.json({ url: "http://untrusted.internal", title: "a".repeat(301), content: "📄".repeat(24_001) }),
		);
		const result = await buildDeepSeekWebTools(key).read_public_url.execute({ url }, execution);
		expect(transport).toHaveBeenCalledExactlyOnceWith(
			"https://api.deepseek.com/v1/tools/fetch",
			expect.objectContaining({
				method: "POST",
				headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
				body: JSON.stringify({ url }),
				redirect: "error",
			}),
		);
		expect(result).toEqual({ url, title: "a".repeat(300), content: "📄".repeat(24_000), truncated: true });
	});

	it.each([{}, { title: null, content: null }])("accepts missing or null fields", async (data) => {
		transport.mockResolvedValue(Response.json(data));
		await expect(buildDeepSeekWebTools(key).read_public_url.execute(page, execution)).resolves.toEqual({
			...page,
			title: "",
			content: "",
			truncated: false,
		});
	});
});

describe("bounded research requests", () => {
	it.each(["declared", "streamed"])("cancels the reader on a %s response over 1 MiB", async (mode) => {
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(1_048_576));
				controller.enqueue(new Uint8Array(1));
			},
			cancel,
		});
		transport.mockResolvedValue(
			new Response(stream, { headers: { "Content-Length": mode === "declared" ? "1048577" : "10" } }),
		);
		await expect(buildDeepSeekWebTools(key).read_public_url.execute(page, execution)).rejects.toThrow(neutral);
		expect(cancel).toHaveBeenCalledOnce();
	});

	it("accepts exactly 1 MiB and decodes a UTF-8 character split across chunks", async () => {
		const prefix = '{"content":"';
		const bytes = new TextEncoder().encode(`${prefix}中"}`.padEnd(1_048_576 - 2));
		expect(bytes.byteLength).toBe(1_048_576);
		transport.mockResolvedValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(bytes.subarray(0, prefix.length + 1));
						controller.enqueue(bytes.subarray(prefix.length + 1));
						controller.close();
					},
				}),
			),
		);
		await expect(buildDeepSeekWebTools(key).read_public_url.execute(page, execution)).resolves.toMatchObject({
			content: "中",
		});
	});

	it.each(["caller", "deadline"])(
		"aborts an in-flight request at the %s signal without exposing its reason",
		async (source) => {
			const caller = new AbortController();
			const deadline = new AbortController();
			const timer = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
			transport.mockImplementation(
				async (_url, init) =>
					new Promise<Response>((_resolve, reject) => {
						const signal = init?.signal;
						signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
					}),
			);
			const pending = buildDeepSeekWebTools(key).read_public_url.execute(page, {
				...execution,
				abortSignal: caller.signal,
			});
			expect(timer).toHaveBeenCalledWith(30_000);
			(source === "caller" ? caller : deadline).abort(new Error(key));
			await expect(pending).rejects.toMatchObject(
				source === "caller" ? { name: "AbortError", message: "Web research was cancelled." } : { message: neutral },
			);
		},
	);

	it("reserves three shared attempts before parallel requests finish, including failures, and resets per instance", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		transport.mockImplementation(async () => Response.json({ results: [] }));
		transport.mockRejectedValueOnce(new Error(key));
		const options = { maxCallsPerTurn: 3, isSystem: true };
		const tools = buildDeepSeekWebTools(key, options);
		const results = await Promise.allSettled([
			tools.lookup_online_sources.execute(query, execution),
			tools.read_public_url.execute(page, execution),
			tools.read_public_url.execute(page, execution),
			tools.lookup_online_sources.execute(query, execution),
		]);
		expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled", "rejected"]);
		expect(results[3]).toMatchObject({ reason: { message: expect.stringContaining("information already available") } });
		expect(transport).toHaveBeenCalledTimes(3);
		await buildDeepSeekWebTools(key, options).lookup_online_sources.execute(query, execution);
		expect(transport).toHaveBeenCalledTimes(4);
	});

	it("allows four personal requests in one turn", async () => {
		transport.mockImplementation(async () => Response.json({ results: [] }));
		const tools = buildDeepSeekWebTools(key);
		for (let attempt = 0; attempt < 4; attempt++) await tools.lookup_online_sources.execute(query, execution);
		expect(transport).toHaveBeenCalledTimes(4);
	});
});

describe("sanitized tool failures", () => {
	it.each([
		[401, "API key"],
		[402, "insufficient balance"],
		[403, "permission"],
		[404, "unavailable"],
		[429, "rate limit"],
	] as const)("returns personal guidance but only a neutral system error for HTTP %s", async (status, hint) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const sensitive = `${page.url}?token=${key}`;
		transport.mockImplementation(async () => new Response(sensitive, { status }));
		const personal = buildDeepSeekWebTools(key).lookup_online_sources.execute(query, execution);
		await expect(personal).rejects.toThrow(hint);
		await expect(personal).rejects.not.toThrow(sensitive);
		expect(warn).not.toHaveBeenCalled();
		const system = buildDeepSeekWebTools(key, { isSystem: true }).read_public_url.execute(page, execution);
		await expect(system).rejects.toMatchObject({ message: neutral });
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify({ evt: "system_ai.web_tool_error", operation: "fetch", statusCode: status }),
		);
	});

	it("sanitizes transport, JSON and schema errors", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		transport
			.mockRejectedValueOnce(new Error(`upstream ${key}`))
			.mockResolvedValueOnce(new Response(page.url))
			.mockResolvedValueOnce(Response.json({ results: key }));
		const tools = buildDeepSeekWebTools(key, { isSystem: true });
		for (const statusCode of [null, 200, 200]) {
			await expect(tools.lookup_online_sources.execute(query, execution)).rejects.toMatchObject({ message: neutral });
			expect(warn).toHaveBeenLastCalledWith(
				JSON.stringify({ evt: "system_ai.web_tool_error", operation: "search", statusCode }),
			);
		}
	});
});
