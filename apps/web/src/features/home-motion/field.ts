export type Rectangle = { x: number; y: number; width: number; height: number };

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smoothstep = (low: number, high: number, value: number) => {
	const t = clamp01((value - low) / (high - low));
	return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(x: number, y: number, z: number, seed: number) {
	let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ seed;
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** Continuous, seeded value noise. Time changes the field, never the grid coordinates. */
export function noise(x: number, y: number, z: number, seed = 2417): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const u = smoothstep(0, 1, x - ix);
	const v = smoothstep(0, 1, y - iy);
	const w = smoothstep(0, 1, z - iz);
	const plane = (dz: number) =>
		mix(
			mix(hash(ix, iy, iz + dz, seed), hash(ix + 1, iy, iz + dz, seed), u),
			mix(hash(ix, iy + 1, iz + dz, seed), hash(ix + 1, iy + 1, iz + dz, seed), u),
			v,
		);
	return mix(plane(0), plane(1), w);
}

export function fieldAt(x: number, y: number, seconds: number): number {
	const qx = x / 260;
	const qy = y / 260;
	const t = seconds * 0.105;
	const wx = noise(qx * 0.66, qy * 0.66, t, 931) - 0.5;
	const wy = noise(qx * 0.66 + 9.7, qy * 0.66 - 3.1, t, 231) - 0.5;
	const a = qx + wx * 1.8 + t * 0.23;
	const b = qy + wy * 1.8 - t * 0.12;
	return clamp01(noise(a, b, t, 181) * 0.7 + noise(a * 2.15, b * 2.15, t * 1.1, 973) * 0.3);
}

/** Broad rounded falloff around measured content; no screen-centred hard cut-out. */
export function protectionAt(x: number, y: number, rectangles: Rectangle[], softness: number): number {
	let protection = 0;
	for (const rect of rectangles) {
		const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width);
		const dy = Math.max(rect.y - y, 0, y - rect.y - rect.height);
		protection = Math.max(protection, 1 - smoothstep(0, softness, Math.hypot(dx, dy)));
	}
	return protection;
}

export function gridPlan(width: number, height: number, deviceRatio: number) {
	if (!(width > 0 && height > 0 && Number.isFinite(width + height))) return null;
	const mobile = width < 600;
	const cell = Math.max(mobile ? 16 : 11, Math.ceil(Math.sqrt((width * height) / (mobile ? 5000 : 16000))));
	const columns = Math.floor(width / cell);
	const rows = Math.floor(height / cell);
	const dpr = Math.min(Math.max(0.1, deviceRatio || 1), mobile ? 1.5 : 2, Math.sqrt(4000000 / (width * height)));
	return { width, height, cell, columns, rows, dpr, count: columns * rows };
}
