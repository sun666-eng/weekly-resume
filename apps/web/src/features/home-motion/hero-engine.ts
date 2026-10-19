import type { MotionEngine } from "./browser";
import type { Rectangle } from "./field";
import { drawSamples, exposeDiagnostics, observeDpr, observePlayback } from "./browser";
import { fieldAt, gridPlan, protectionAt, smoothstep } from "./field";
import { createPlayback } from "./playback";

type HeroOptions = {
	host: HTMLElement;
	canvas: HTMLCanvasElement;
	paused: boolean;
	onReduced: (reduced: boolean) => void;
};
const glyphs = [".", ":", "+", "*", "o", "O", "@", "#"];
const alphaSteps = 16;

export function createHeroEngine({ host, canvas, paused, onReduced }: HeroOptions): MotionEngine | null {
	const context = canvas.getContext("2d", { alpha: true });
	const homepage = host.closest<HTMLElement>(".homepage");
	const hero = homepage?.querySelector<HTMLElement>('[aria-labelledby="hero-title"]');
	if (!context || !homepage || !hero) return null;
	let plan: ReturnType<typeof gridPlan> = null;
	let atlas: HTMLCanvasElement | null = null;
	let tile = 0;
	let protection = new Float32Array(0);
	let painted = new Int16Array(0);
	let field = new Float32Array(0);
	let fieldColumns = 0;
	let fieldRows = 0;
	const spacing = 44;
	const samples = drawSamples();
	const playback = createPlayback({
		request: (callback) => window.requestAnimationFrame(callback),
		cancel: (id) => window.cancelAnimationFrame(id),
		fps: 30,
		onError: () => host.removeAttribute("data-ready"),
		render(time) {
			if (!plan || !atlas) return;
			const started = performance.now();
			const { columns, rows, cell } = plan;
			// Evaluate a smooth field on a coarse lattice; all fixed glyphs sample it.
			for (let y = 0; y < fieldRows; y++) {
				for (let x = 0; x < fieldColumns; x++) field[y * fieldColumns + x] = fieldAt(x * spacing, y * spacing, time);
			}
			for (let row = 0; row < rows; row++) {
				const py = row * cell + cell / 2;
				const fy = py / spacing;
				const iy = Math.floor(fy);
				const dy = fy - iy;
				for (let col = 0; col < columns; col++) {
					const region = protection[row * columns + col] ?? 0;
					if (region < 0.025) continue;
					const px = col * cell + cell / 2;
					const fx = px / spacing;
					const ix = Math.floor(fx);
					const dx = fx - ix;
					const at = iy * fieldColumns + ix;
					const a = field[at] ?? 0;
					const b = field[at + 1] ?? a;
					const c = field[at + fieldColumns] ?? a;
					const d = field[at + fieldColumns + 1] ?? c;
					const value = a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
					const intensity = smoothstep(0.25, 0.77, value);
					const opacity = Math.floor((0.1 + intensity * 0.9) * region * (alphaSteps - 1));
					const glyph = Math.min(glyphs.length - 1, Math.floor(intensity * glyphs.length));
					const index = row * columns + col;
					const stamp = opacity < 1 ? 0 : 1 + glyph * alphaSteps + opacity;
					if (painted[index] === stamp) continue;
					painted[index] = stamp;
					// The grid never moves. Repaint only cells whose cached glyph/alpha changed.
					context.clearRect(col * cell, row * cell, cell, cell);
					if (opacity < 1) continue;
					context.drawImage(atlas, glyph * tile, opacity * tile, tile, tile, col * cell, row * cell, cell, cell);
				}
			}
			host.dataset.ready = "true";
			samples.record(performance.now() - started);
		},
	});
	playback.setFlags({ paused });
	const showFallback = () => {
		host.removeAttribute("data-ready");
		playback.setFlags({ ready: false });
	};
	const update = () => {
		const homeRect = homepage.getBoundingClientRect();
		const heroRect = hero.getBoundingClientRect();
		const height = Math.max(0, heroRect.bottom - homeRect.top);
		host.style.height = `${height}px`;
		plan = gridPlan(homeRect.width, height, window.devicePixelRatio);
		if (!plan) {
			showFallback();
			return;
		}
		const { width, cell, dpr, columns, rows } = plan;
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.imageSmoothingEnabled = true;
		tile = Math.ceil(cell * dpr);
		atlas = document.createElement("canvas");
		atlas.width = tile * glyphs.length;
		atlas.height = tile * alphaSteps;
		const ink = atlas.getContext("2d");
		if (!ink) {
			showFallback();
			return;
		}
		ink.fillStyle = getComputedStyle(homepage).getPropertyValue("--home-ink").trim();
		ink.font = `${Math.round(tile * 0.77)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
		ink.textAlign = "center";
		ink.textBaseline = "middle";
		for (let alpha = 0; alpha < alphaSteps; alpha++) {
			ink.globalAlpha = (alpha / (alphaSteps - 1)) * 0.48;
			glyphs.forEach((glyph, index) => {
				ink.fillText(glyph, (index + 0.5) * tile, (alpha + 0.52) * tile);
			});
		}
		const rectangles: Rectangle[] = [...hero.children].map((element) => {
			const rect = element.getBoundingClientRect();
			return { x: rect.left - homeRect.left, y: rect.top - homeRect.top, width: rect.width, height: rect.height };
		});
		protection = new Float32Array(columns * rows);
		painted = new Int16Array(columns * rows).fill(-1);
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < columns; col++) {
				protection[row * columns + col] =
					1 - protectionAt((col + 0.5) * cell, (row + 0.5) * cell, rectangles, width < 600 ? 30 : 72);
			}
		}
		fieldColumns = Math.ceil(width / spacing) + 2;
		fieldRows = Math.ceil(height / spacing) + 2;
		field = new Float32Array(fieldColumns * fieldRows);
		playback.setFlags({ ready: true });
		playback.invalidate();
	};
	const resize = new ResizeObserver(update);
	resize.observe(hero);
	for (const child of hero.children) resize.observe(child);
	const theme = new MutationObserver(update);
	theme.observe(homepage, { attributes: true, attributeFilter: ["class", "style"] });
	theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
	const stopDpr = observeDpr(update);
	window.addEventListener("resize", update);
	const stopVisibility = observePlayback(host, playback, onReduced);
	const stopDiagnostics = exposeDiagnostics(canvas, () => ({
		kind: "hero",
		...playback.snapshot(),
		grid: plan,
		draw: samples.snapshot(),
	}));
	return {
		pause: (value) => playback.setFlags({ paused: value }),
		dispose() {
			playback.dispose();
			stopVisibility();
			stopDpr();
			stopDiagnostics();
			resize.disconnect();
			theme.disconnect();
			window.removeEventListener("resize", update);
			atlas = null;
			field = new Float32Array(0);
			protection = new Float32Array(0);
			painted = new Int16Array(0);
			canvas.width = canvas.height = 0;
			host.removeAttribute("data-ready");
		},
	};
}
