import type { Playback } from "./playback";

export type MotionEngine = { pause: (paused: boolean) => void; dispose: () => void };

/** Visibility gates observe the actual region, independently of resource preloading. */
export function observePlayback(host: HTMLElement, playback: Playback, onReduced: (reduced: boolean) => void) {
	const media = window.matchMedia("(prefers-reduced-motion: reduce)");
	const preference = () => {
		playback.setFlags({ reduced: media.matches });
		onReduced(media.matches);
	};
	const visibility = () => playback.setFlags({ documentVisible: document.visibilityState !== "hidden" });
	const fallbackVisibility = () => {
		const rect = host.getBoundingClientRect();
		playback.setFlags({ visible: rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 });
	};
	const observer =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver(([entry]) => playback.setFlags({ visible: Boolean(entry?.isIntersecting) }));
	preference();
	visibility();
	observer?.observe(host);
	if (!observer) {
		fallbackVisibility();
		window.addEventListener("scroll", fallbackVisibility, { passive: true });
		window.addEventListener("resize", fallbackVisibility);
	}
	media.addEventListener("change", preference);
	document.addEventListener("visibilitychange", visibility);
	return () => {
		observer?.disconnect();
		media.removeEventListener("change", preference);
		document.removeEventListener("visibilitychange", visibility);
		window.removeEventListener("scroll", fallbackVisibility);
		window.removeEventListener("resize", fallbackVisibility);
	};
}

/** Only records local draw submission cost, not presentation FPS or GPU timing. */
export function drawSamples() {
	const samples: number[] = [];
	let cursor = 0;
	return {
		record(duration: number) {
			samples[cursor % 1800] = duration;
			cursor++;
		},
		snapshot() {
			const sorted = [...samples].sort((a, b) => a - b);
			return { count: cursor, retained: sorted.length, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
		},
	};
}

export function exposeDiagnostics(canvas: HTMLCanvasElement, read: () => unknown) {
	Object.defineProperty(canvas, "motionDiagnostics", { configurable: true, value: read });
	return () => Reflect.deleteProperty(canvas, "motionDiagnostics");
}

export function observeDpr(update: () => void) {
	let media: MediaQueryList;
	const changed = () => {
		media?.removeEventListener("change", changed);
		media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		media.addEventListener("change", changed);
		update();
	};
	changed();
	return () => media.removeEventListener("change", changed);
}
