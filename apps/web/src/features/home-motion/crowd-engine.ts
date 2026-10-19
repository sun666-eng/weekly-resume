import type { MotionEngine } from "./browser";
import type { Actor } from "./crowd-model";
import { drawSamples, exposeDiagnostics, observeDpr, observePlayback } from "./browser";
import { actorBob, advanceActor, createActors, depthOrder, resizeActors } from "./crowd-model";
import { gridPlan } from "./field";
import { createPlayback } from "./playback";

type CrowdOptions = {
	host: HTMLElement;
	canvas: HTMLCanvasElement;
	paused: boolean;
	signal: AbortSignal;
	onReduced: (reduced: boolean) => void;
};
// Weak keys preserve one decode promise during Strict Mode setup/cleanup/setup without retaining DOM.
const decoded = new WeakMap<HTMLImageElement, Promise<void>>();

export async function createCrowdEngine({
	host,
	canvas,
	paused,
	signal,
	onReduced,
}: CrowdOptions): Promise<MotionEngine | null> {
	const context = canvas.getContext("2d", { alpha: true });
	if (!context || signal.aborted) return null;
	const images = [...host.querySelectorAll<HTMLImageElement>(".motion-crowd-fallback img")];
	if (!images.length) return null;
	let abort = () => {};
	const aborted = new Promise<never>((_, reject) => {
		abort = () => reject(new DOMException("Disposed", "AbortError"));
		signal.addEventListener("abort", abort, { once: true });
	});
	try {
		await Promise.race([
			Promise.all(
				images.map((image) => {
					image.loading = "eager";
					let promise = decoded.get(image);
					if (!promise) {
						promise = image.decode();
						decoded.set(image, promise);
					}
					return promise;
				}),
			),
			aborted,
		]);
	} catch {
		return null;
	} finally {
		signal.removeEventListener("abort", abort);
	}
	if (signal.aborted) return null;
	let width = 0;
	let height = 0;
	let ratio = 0;
	let actors: Actor[] = [];
	let sorted: Actor[] = [];
	let sprites: HTMLCanvasElement[] = [];
	const samples = drawSamples();
	const releaseSprites = () => {
		for (const sprite of sprites) sprite.width = sprite.height = 0;
		sprites = [];
	};
	const playback = createPlayback({
		request: (callback) => window.requestAnimationFrame(callback),
		cancel: (id) => window.cancelAnimationFrame(id),
		fps: 60,
		onError: () => host.removeAttribute("data-ready"),
		render(time, dt) {
			const start = performance.now();
			context.clearRect(0, 0, width, height);
			for (const actor of sorted) {
				const sprite = sprites[actor.asset];
				if (!sprite) continue;
				const actorHeight = height * actor.scale;
				const actorWidth = (sprite.width / sprite.height) * actorHeight;
				advanceActor(actor, dt, width, actorWidth);
				const y = height + 8 - (2 - actor.layer) * 10 + actorBob(actor, time) - actorHeight;
				context.drawImage(sprite, actor.x - actorWidth / 2, y, actorWidth, actorHeight);
			}
			host.dataset.ready = "true";
			samples.record(performance.now() - start);
		},
	});
	playback.setFlags({ paused });
	const showFallback = () => {
		host.removeAttribute("data-ready");
		playback.setFlags({ ready: false });
	};
	const resize = () => {
		const rect = host.getBoundingClientRect();
		const plan = gridPlan(rect.width, rect.height, window.devicePixelRatio);
		if (!plan) {
			showFallback();
			return;
		}
		const rebuild = height !== plan.height || ratio !== plan.dpr || !sprites.length;
		actors = actors.length
			? resizeActors(actors, width, plan.width, images.length)
			: createActors(plan.width, images.length);
		width = plan.width;
		height = plan.height;
		ratio = plan.dpr;
		sorted = depthOrder(actors);
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		if (rebuild) {
			releaseSprites();
			for (const image of images) {
				const sprite = document.createElement("canvas");
				sprite.height = Math.ceil(height * ratio);
				sprite.width = Math.ceil((image.naturalWidth / image.naturalHeight) * sprite.height);
				const target = sprite.getContext("2d");
				if (!target) {
					releaseSprites();
					showFallback();
					return;
				}
				target.drawImage(image, 0, 0, sprite.width, sprite.height);
				sprites.push(sprite);
			}
		}
		playback.setFlags({ ready: true });
		playback.invalidate();
	};
	const observer = new ResizeObserver(resize);
	observer.observe(host);
	const stopDpr = observeDpr(resize);
	const stopVisibility = observePlayback(host, playback, onReduced);
	const stopDiagnostics = exposeDiagnostics(canvas, () => ({
		kind: "crowd",
		...playback.snapshot(),
		draw: samples.snapshot(),
		width,
		height,
		dpr: ratio,
		actors: actors.map((actor) => ({ ...actor })),
	}));
	return {
		pause: (value) => playback.setFlags({ paused: value }),
		dispose() {
			playback.dispose();
			stopVisibility();
			stopDpr();
			stopDiagnostics();
			observer.disconnect();
			releaseSprites();
			actors = [];
			sorted = [];
			canvas.width = canvas.height = 0;
			host.removeAttribute("data-ready");
		},
	};
}
