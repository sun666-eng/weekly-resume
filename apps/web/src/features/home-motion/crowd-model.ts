export type Actor = {
	id: number;
	asset: number;
	x: number;
	layer: 0 | 1 | 2;
	direction: -1 | 1;
	speed: number;
	scale: number;
	phase: number;
	amplitude: number;
	frequency: number;
};

export function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** x is the centre. Wrapping happens beyond both the entire sprite and overscan. */
export function wrapPosition(x: number, viewport: number, actorWidth: number, overscan = 24) {
	const padding = actorWidth / 2 + overscan;
	return positiveModulo(x + padding, viewport + padding * 2) - padding;
}

export function actorCount(width: number) {
	return width < 600 ? 16 : Math.max(24, Math.min(40, Math.ceil(width / 52)));
}

export function createActors(width: number, assets: number, seed = 6717): Actor[] {
	const random = seededRandom(seed);
	const count = actorCount(width);
	return Array.from({ length: count }, (_, id) => {
		const layer = (id % 3) as Actor["layer"];
		return {
			id,
			asset: id % assets,
			x: ((id + random() * 0.42) / count) * (width + 320) - 160,
			layer,
			direction: layer === 1 ? -1 : 1,
			// Broad differences between opposing layers; small per-person differences avoid early bunching.
			speed: 64 + layer * 28 + random() * 4,
			scale: 0.8 + layer * 0.075 + random() * 0.035,
			phase: random() * Math.PI * 2,
			amplitude: 2 + random() * 3.5,
			frequency: 0.8 + random() * 0.6,
		};
	});
}

export function resizeActors(actors: Actor[], oldWidth: number, width: number, assets: number) {
	const initial = createActors(width, assets);
	return initial.map((next) => {
		const old = actors.find((actor) => actor.id === next.id);
		return old ? { ...old, x: ((old.x + 160) / (oldWidth + 320)) * (width + 320) - 160 } : next;
	});
}

export function advanceActor(actor: Actor, dt: number, viewport: number, actorWidth: number) {
	actor.x = wrapPosition(
		actor.x + actor.direction * actor.speed * Math.max(0, Math.min(dt, 0.05)),
		viewport,
		actorWidth,
	);
}

export const actorBob = (actor: Actor, activeTime: number) =>
	actor.amplitude * Math.sin(activeTime * Math.PI * 2 * actor.frequency + actor.phase);

export const depthOrder = (actors: Actor[]) => [...actors].sort((a, b) => a.layer - b.layer || a.id - b.id);
