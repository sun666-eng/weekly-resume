// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createCrowdEngine } from "./crowd-engine";
import { CrowdMotion, HeroMotion } from "./decorations";
import { createHeroEngine } from "./hero-engine";

class IntersectionMock {
	static instances: IntersectionMock[] = [];
	callback: IntersectionObserverCallback;
	disconnected = false;
	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		IntersectionMock.instances.push(this);
	}
	observe() {}
	disconnect() {
		this.disconnected = true;
	}
	emit(visible: boolean) {
		this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
	}
}
class ResizeMock {
	static instances: ResizeMock[] = [];
	callback: ResizeObserverCallback;
	disconnected = false;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		ResizeMock.instances.push(this);
	}
	observe() {}
	disconnect() {
		this.disconnected = true;
	}
	emit() {
		this.callback([], this as unknown as ResizeObserver);
	}
}
type MockMedia = Omit<MediaQueryList, "matches"> & { matches: boolean; emit: (matches: boolean) => void };
let media: MockMedia[];
let frames: Map<number, FrameRequestCallback>;
let context: {
	clearRect: ReturnType<typeof vi.fn>;
	fillText: ReturnType<typeof vi.fn>;
	drawImage: ReturnType<typeof vi.fn>;
	setTransform: ReturnType<typeof vi.fn>;
};

function rect(width: number, height: number, x = 0, y = 0) {
	return { width, height, left: x, top: y, right: x + width, bottom: y + height, x, y, toJSON() {} };
}
function fixture(kind: "hero" | "crowd") {
	document.body.innerHTML = `<div class="homepage" style="--home-ink:#f1f0eb"><div class="motion-${kind}"><canvas></canvas><div class="${kind === "hero" ? "motion-hero-static" : "motion-crowd-fallback"}"><img src="/home-motion/peep-8.svg" alt=""></div></div><section aria-labelledby="hero-title"><div>Existing copy and button</div><div>Existing product</div></section></div>`;
	const homepage = document.querySelector<HTMLElement>(".homepage");
	const host = document.querySelector<HTMLElement>(`.motion-${kind}`);
	const hero = document.querySelector<HTMLElement>("section");
	const canvas = document.querySelector("canvas");
	const image = document.querySelector("img");
	if (!homepage || !host || !canvas || !hero || !image) throw new Error("Fixture missing");
	const homeMeasure = vi.spyOn(homepage, "getBoundingClientRect").mockReturnValue(rect(1440, 5000));
	const measure = vi.spyOn(host, "getBoundingClientRect").mockReturnValue(rect(1440, kind === "hero" ? 850 : 310));
	vi.spyOn(hero, "getBoundingClientRect").mockReturnValue(rect(1200, 750, 120, 100));
	for (const child of hero.children) vi.spyOn(child, "getBoundingClientRect").mockReturnValue(rect(400, 500, 200, 200));
	Object.defineProperties(image, { naturalWidth: { value: 200 }, naturalHeight: { value: 300 } });
	vi.spyOn(image, "decode").mockResolvedValue();
	return { host, canvas, image, measure, homeMeasure, hero };
}
function tick(time: number) {
	const pending = [...frames.values()];
	frames.clear();
	for (const callback of pending) callback(time);
}

// Happy DOM returns an empty string for the CSS initial value (visible).
const visibility = (element: HTMLElement) => getComputedStyle(element).visibility || "visible";

beforeEach(() => {
	const style = document.createElement("style");
	style.id = "motion-test-css";
	style.textContent = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "motion.css"), "utf8");
	document.head.append(style);
	media = [];
	frames = new Map();
	let frameId = 0;
	IntersectionMock.instances = [];
	ResizeMock.instances = [];
	vi.stubGlobal("IntersectionObserver", IntersectionMock);
	vi.stubGlobal("ResizeObserver", ResizeMock);
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
		frames.set(++frameId, callback);
		return frameId;
	});
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
		frames.delete(id);
	});
	vi.spyOn(window, "matchMedia").mockImplementation((query) => {
		const target = new EventTarget();
		const result = Object.assign(target, {
			media: query,
			matches: false,
			onchange: null,
			addListener() {},
			removeListener() {},
			emit(matches: boolean) {
				result.matches = matches;
				result.dispatchEvent(new Event("change"));
			},
		}) as MockMedia;
		media.push(result);
		return result;
	});
	context = { clearRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn() };
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	document.getElementById("motion-test-css")?.remove();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("browser renderer boundaries", () => {
	it.each([
		["hero", "running"],
		["hero", "paused"],
		["hero", "reduced"],
		["crowd", "running"],
		["crowd", "paused"],
		["crowd", "reduced"],
	] as const)("%s restores fallback after cache context failure, then recovers while %s", async (kind, mode) => {
		const f = fixture(kind);
		const options = { ...f, paused: mode === "paused", onReduced: vi.fn(), signal: new AbortController().signal };
		const engine = kind === "hero" ? createHeroEngine(options) : await createCrowdEngine(options);
		if (mode === "reduced") media.find((m) => m.media.includes("reduced-motion"))?.emit(true);
		IntersectionMock.instances[0]?.emit(true);
		const fallback = f.host.querySelector<HTMLElement>(
			kind === "hero" ? ".motion-hero-static" : ".motion-crowd-fallback",
		);
		if (!fallback) throw new Error("Fallback missing");
		const diagnostics = () => Reflect.get(f.canvas, "motionDiagnostics")();
		expect(f.host.dataset.ready).toBe("true");
		expect(visibility(fallback)).toBe("hidden");
		expect(frames.size).toBe(mode === "running" ? 1 : 0);
		let failCache = true;
		vi.mocked(f.canvas.getContext).mockImplementation(function (this: HTMLCanvasElement) {
			return failCache && this !== f.canvas ? null : (context as unknown as CanvasRenderingContext2D);
		});
		// A changed height forces cached crowd sprites to rebuild after a successful draw.
		f.measure.mockReturnValue(rect(1440, 311));
		ResizeMock.instances[0]?.emit();
		expect(diagnostics().ready).toBe(false);
		expect(frames.size).toBe(0);
		expect(f.host.hasAttribute("data-ready")).toBe(false);
		expect(visibility(fallback)).toBe("visible");
		expect(visibility(f.canvas)).toBe("hidden");
		const renders = diagnostics().renders;
		tick(100000);
		expect(diagnostics().renders).toBe(renders);
		failCache = false;
		ResizeMock.instances[0]?.emit();
		expect(f.host.dataset.ready).toBe("true");
		expect(visibility(fallback)).toBe("hidden");
		expect(visibility(f.canvas)).toBe("visible");
		expect(diagnostics()).toMatchObject({ ready: true, paused: mode === "paused", reduced: mode === "reduced" });
		expect(frames.size).toBe(mode === "running" ? 1 : 0);
		engine?.pause(false);
		media.find((m) => m.media.includes("reduced-motion"))?.emit(false);
		expect(frames.size).toBe(1);
		engine?.dispose();
		expect(frames.size).toBe(0);
	});
	it.each(["hero", "crowd"] as const)(
		"%s restores fallback when measured size disappears after a successful draw",
		async (kind) => {
			const f = fixture(kind);
			const options = { ...f, paused: false, onReduced: vi.fn(), signal: new AbortController().signal };
			const engine = kind === "hero" ? createHeroEngine(options) : await createCrowdEngine(options);
			IntersectionMock.instances[0]?.emit(true);
			expect(f.host.dataset.ready).toBe("true");
			const measure = kind === "hero" ? f.homeMeasure : f.measure;
			measure.mockReturnValue(rect(0, 0));
			ResizeMock.instances[0]?.emit();
			expect(f.host.hasAttribute("data-ready")).toBe(false);
			expect(getComputedStyle(f.canvas).visibility).toBe("hidden");
			expect(frames.size).toBe(0);
			measure.mockReturnValue(rect(1440, kind === "hero" ? 5000 : 310));
			ResizeMock.instances[0]?.emit();
			expect(f.host.dataset.ready).toBe("true");
			expect(frames.size).toBe(1);
			engine?.dispose();
		},
	);
	it("Strict Mode and ten remounts leave one clock per visible decoration and no retained observers", async () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			if (this.tagName === "SECTION") return rect(1000, 700, 100, 100);
			if (this.parentElement?.tagName === "SECTION") return rect(400, 500, 100, 150);
			return rect(1200, this.classList.contains("motion-crowd") ? 310 : 800);
		});
		vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
		vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(200);
		vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(300);
		for (let cycle = 0; cycle < 10; cycle++) {
			const container = document.createElement("div");
			document.body.append(container);
			const root = createRoot(container);
			await act(() => {
				root.render(
					createElement(
						StrictMode,
						null,
						createElement(
							I18nProvider,
							{ i18n },
							createElement(
								"div",
								{ className: "homepage" },
								createElement(HeroMotion),
								createElement(
									"section",
									{ "aria-labelledby": "hero-title" },
									createElement("div", null, "Existing content"),
								),
								createElement(CrowdMotion),
							),
						),
					),
				);
			});
			// First intersection preloads the crowd; the renderer then creates its own real visibility observer.
			await act(() => {
				for (const observer of [...IntersectionMock.instances]) if (!observer.disconnected) observer.emit(true);
			});
			await act(() => {
				for (const observer of [...IntersectionMock.instances]) if (!observer.disconnected) observer.emit(true);
			});
			expect(frames.size).toBe(2);
			expect(IntersectionMock.instances.filter((o) => !o.disconnected)).toHaveLength(2);
			expect(ResizeMock.instances.filter((o) => !o.disconnected)).toHaveLength(2);
			expect(container.querySelectorAll('canvas[aria-hidden="true"][tabindex="-1"]')).toHaveLength(2);
			await act(() => root.unmount());
			expect(frames.size).toBe(0);
			expect(IntersectionMock.instances.every((o) => o.disconnected)).toBe(true);
			expect(ResizeMock.instances.every((o) => o.disconnected)).toBe(true);
			container.remove();
		}
	});
	it("hero draws only when visible, caches glyphs, and respects live reduced/manual pause", () => {
		const f = fixture("hero");
		const onReduced = vi.fn();
		const engine = createHeroEngine({ ...f, paused: false, onReduced });
		expect(engine).not.toBeNull();
		expect(context.drawImage).not.toHaveBeenCalled();
		const glyphCalls = context.fillText.mock.calls.length;
		IntersectionMock.instances[0]?.emit(true);
		expect(context.drawImage).toHaveBeenCalled();
		tick(0);
		tick(34);
		tick(68);
		expect(context.fillText).toHaveBeenCalledTimes(glyphCalls);
		media.find((m) => m.media.includes("reduced-motion"))?.emit(true);
		expect(frames.size).toBe(0);
		engine?.pause(true);
		media.find((m) => m.media.includes("reduced-motion"))?.emit(false);
		IntersectionMock.instances[0]?.emit(false);
		IntersectionMock.instances[0]?.emit(true);
		expect(frames.size).toBe(0);
		engine?.dispose();
		expect(Reflect.has(f.canvas, "motionDiagnostics")).toBe(false);
		expect(IntersectionMock.instances.every((o) => o.disconnected)).toBe(true);
		expect(ResizeMock.instances.every((o) => o.disconnected)).toBe(true);
		expect(f.canvas.width).toBe(0);
	});
	it("stops while document is hidden and cleans media listeners", () => {
		const f = fixture("hero");
		const onReduced = vi.fn();
		const engine = createHeroEngine({ ...f, paused: false, onReduced });
		IntersectionMock.instances[0]?.emit(true);
		vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
		document.dispatchEvent(new Event("visibilitychange"));
		expect(frames.size).toBe(0);
		const calls = context.drawImage.mock.calls.length;
		tick(99999);
		expect(context.drawImage).toHaveBeenCalledTimes(calls);
		engine?.dispose();
		const reducedCalls = onReduced.mock.calls.length;
		media.find((m) => m.media.includes("reduced-motion"))?.emit(true);
		expect(onReduced).toHaveBeenCalledTimes(reducedCalls);
	});
	it("leaves fallback in place when context is unavailable or the hero is unmeasured", async () => {
		const f = fixture("hero");
		vi.mocked(f.canvas.getContext).mockReturnValue(null);
		expect(createHeroEngine({ ...f, paused: false, onReduced: vi.fn() })).toBeNull();
		expect(
			await createCrowdEngine({ ...f, paused: false, onReduced: vi.fn(), signal: new AbortController().signal }),
		).toBeNull();
		expect(f.host.hasAttribute("data-ready")).toBe(false);
		expect(frames.size).toBe(0);
	});
	it("retains clear static images if decode fails or initialization is aborted", async () => {
		const f = fixture("crowd");
		vi.mocked(f.image.decode).mockRejectedValue(new Error("Image failed"));
		expect(
			await createCrowdEngine({ ...f, paused: false, onReduced: vi.fn(), signal: new AbortController().signal }),
		).toBeNull();
		expect(f.host.hasAttribute("data-ready")).toBe(false);
		expect(f.host.querySelector("img")).toBe(f.image);
		const signal = AbortSignal.abort();
		expect(await createCrowdEngine({ ...f, paused: false, onReduced: vi.fn(), signal })).toBeNull();
		expect(frames.size).toBe(0);
	});
	it("reserves readiness for nonzero size and resumes without accumulating DPR transforms", async () => {
		const f = fixture("crowd");
		f.measure.mockReturnValue(rect(0, 0));
		const engine = await createCrowdEngine({
			...f,
			paused: true,
			onReduced: vi.fn(),
			signal: new AbortController().signal,
		});
		IntersectionMock.instances[0]?.emit(true);
		expect(f.host.hasAttribute("data-ready")).toBe(false);
		f.measure.mockReturnValue(rect(390, 220));
		ResizeMock.instances[0]?.emit();
		expect(f.host.dataset.ready).toBe("true");
		expect(context.setTransform).toHaveBeenCalledWith(expect.any(Number), 0, 0, expect.any(Number), 0, 0);
		expect(frames.size).toBe(0);
		engine?.dispose();
		expect(frames.size).toBe(0);
		expect(f.canvas.width).toBe(0);
	});
});
