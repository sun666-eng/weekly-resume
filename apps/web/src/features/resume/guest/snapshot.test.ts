// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { captureGuestSnapshot, downloadLocalBackup } from "./snapshot";

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngBase64 = btoa(String.fromCharCode(...pngBytes));

function resumeWithPhoto(url: string) {
	const data = structuredClone(defaultResumeData);
	data.picture.url = url;
	data.basics.name = "林沐";
	return data;
}

async function withUnhandledRejectionProbe(run: () => Promise<void>) {
	const rejections: unknown[] = [];
	const onWindow = (event: PromiseRejectionEvent) => {
		rejections.push(event.reason);
		event.preventDefault();
	};
	const onProcess = (reason: unknown) => {
		rejections.push(reason);
	};
	window.addEventListener("unhandledrejection", onWindow);
	process.on("unhandledRejection", onProcess);
	try {
		await run();
		await Promise.resolve();
		await Promise.resolve();
		expect(rejections).toEqual([]);
	} finally {
		window.removeEventListener("unhandledrejection", onWindow);
		process.off("unhandledRejection", onProcess);
	}
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("captureGuestSnapshot photo resilience", () => {
	it("embeds a data-URL photo without fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const snapshot = await captureGuestSnapshot("虚构草稿", resumeWithPhoto(`data:image/png;base64,${pngBase64}`));
		expect(fetchMock).not.toHaveBeenCalled();
		expect(snapshot.data.picture.url).toBe("");
		expect(snapshot.photo).toEqual({ mime: "image/png", base64: pngBase64 });
	});

	it("keeps the resume when a remote photo is unreachable or CORS-blocked", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		const data = resumeWithPhoto("https://fixture.invalid/blocked.png");
		const snapshot = await captureGuestSnapshot("虚构草稿", data);
		expect(snapshot.photo).toBeNull();
		expect(snapshot.data.basics.name).toBe("林沐");
		expect(snapshot.data.picture.url).toBe("");
		expect(data.picture.url).toBe("https://fixture.invalid/blocked.png");
	});

	it("skips an unsupported photo MIME instead of failing the snapshot", async () => {
		const snapshot = await captureGuestSnapshot("虚构草稿", resumeWithPhoto("data:image/svg+xml;base64,PHN2Zy8+"));
		expect(snapshot.photo).toBeNull();
		expect(snapshot.data.picture.url).toBe("");
	});

	it("skips a non-OK photo response without throwing", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
		const snapshot = await captureGuestSnapshot("虚构草稿", resumeWithPhoto("https://fixture.invalid/missing.png"));
		expect(snapshot.photo).toBeNull();
		expect(snapshot.data.basics.name).toBe("林沐");
	});

	it("embeds a reachable same-origin photo response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(pngBytes, { status: 200, headers: { "Content-Type": "image/png" } })),
		);
		const snapshot = await captureGuestSnapshot("虚构草稿", resumeWithPhoto("https://app.test/photo.png"));
		expect(snapshot.photo).toEqual({ mime: "image/png", base64: pngBase64 });
	});

	it("retries a previously unreachable photo URL instead of locking it out", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValueOnce(new Response(pngBytes, { status: 200, headers: { "Content-Type": "image/png" } }));
		vi.stubGlobal("fetch", fetchMock);
		const url = "https://fixture.invalid/recovered.png";
		expect((await captureGuestSnapshot("虚构草稿", resumeWithPhoto(url))).photo).toBeNull();
		expect((await captureGuestSnapshot("虚构草稿", resumeWithPhoto(url))).photo).toEqual({
			mime: "image/png",
			base64: pngBase64,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("still prepares a local backup JSON download when the photo cannot be read", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		await downloadLocalBackup("虚构草稿", resumeWithPhoto("https://fixture.invalid/missing.png"));
		expect(click).toHaveBeenCalledOnce();
	});

	it("times out a hung fetch and swallows a late rejection", async () => {
		vi.useFakeTimers();
		let rejectFetch: (reason: unknown) => void = () => undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((_resolve, reject) => {
						rejectFetch = reject;
					}),
			),
		);
		await withUnhandledRejectionProbe(async () => {
			const done = captureGuestSnapshot("虚构草稿", resumeWithPhoto("https://fixture.invalid/hang-fetch.png"));
			await vi.advanceTimersByTimeAsync(2_000);
			const snapshot = await done;
			expect(snapshot.photo).toBeNull();
			expect(snapshot.data.basics.name).toBe("林沐");
			rejectFetch(new TypeError("late fetch"));
		});
	});

	it("times out a hung response body and swallows the late blob without an unhandled rejection", async () => {
		vi.useFakeTimers();
		let rejectBlob: (reason: unknown) => void = () => undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				headers: { get: () => "image/png" },
				blob: () =>
					new Promise<Blob>((_resolve, reject) => {
						rejectBlob = reject;
					}),
			}),
		);
		await withUnhandledRejectionProbe(async () => {
			const done = captureGuestSnapshot("虚构草稿", resumeWithPhoto("https://fixture.invalid/hang-body.png"));
			await vi.advanceTimersByTimeAsync(2_000);
			const snapshot = await done;
			expect(snapshot.photo).toBeNull();
			rejectBlob(new Error("late blob"));
		});
	});

	it("times out a hung FileReader without throwing", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"FileReader",
			class {
				result = "";
				onload: (() => void) | null = null;
				onerror: (() => void) | null = null;
				onabort: (() => void) | null = null;
				abort() {}
				readAsDataURL() {}
			},
		);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				headers: { get: () => "image/png" },
				blob: async () => new Blob([pngBytes], { type: "image/png" }),
			}),
		);
		const done = captureGuestSnapshot("虚构草稿", resumeWithPhoto("https://fixture.invalid/hang-reader.png"));
		await vi.advanceTimersByTimeAsync(2_000);
		const snapshot = await done;
		expect(snapshot.photo).toBeNull();
		expect(snapshot.data.basics.name).toBe("林沐");
	});
});
