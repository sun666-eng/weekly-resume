import { describe, expect, it } from "vitest";
import {
	actorBob,
	advanceActor,
	createActors,
	depthOrder,
	positiveModulo,
	resizeActors,
	wrapPosition,
} from "./crowd-model";

describe("independent crowd actors", () => {
	it("starts full width with stable identities, both directions, varied speeds and phases", () => {
		const actors = createActors(1440, 16);
		expect(actors).toEqual(createActors(1440, 16));
		expect(actors.length).toBeGreaterThanOrEqual(24);
		expect(createActors(390, 16)).toHaveLength(16);
		expect(new Set(actors.map((actor) => actor.direction))).toEqual(new Set([-1, 1]));
		expect(new Set(actors.map((actor) => actor.speed)).size).toBe(actors.length);
		expect(new Set(actors.map((actor) => actor.phase)).size).toBe(actors.length);
		for (const actor of actors) expect(Math.abs(actorBob(actor, 4))).toBeLessThanOrEqual(5.5);
	});
	it("moves by elapsed seconds, handles negative modulo, and wraps only after fully offscreen", () => {
		expect(positiveModulo(-2, 10)).toBe(8);
		expect(wrapPosition(-100, 1000, 200)).toBe(-100);
		expect(wrapPosition(1100, 1000, 200)).toBe(1100);
		expect(wrapPosition(-125, 1000, 200)).toBe(1123);
		expect(wrapPosition(1125, 1000, 200)).toBe(-123);
		const [actor] = createActors(1000, 16);
		if (!actor) throw new Error("No actor");
		actor.x = 500;
		advanceActor(actor, 0.02, 1000, 200);
		expect(actor.x).toBeCloseTo(500 + actor.direction * actor.speed * 0.02);
		const x = actor.x;
		advanceActor(actor, 100, 1000, 200);
		expect(Math.abs(actor.x - x)).toBeLessThanOrEqual(6.5);
	});
	it("covers repeated edge entries without changing IDs, phases or depth order", () => {
		const actors = createActors(1440, 16);
		const order = depthOrder(actors).map((actor) => actor.id);
		const phases = actors.map((actor) => actor.phase);
		for (let frame = 0; frame < 2400; frame++) {
			for (const actor of actors) advanceActor(actor, 1 / 60, 1440, 200);
			for (const actor of actors) {
				expect(actor.x).toBeGreaterThanOrEqual(-124);
				expect(actor.x).toBeLessThan(1564);
			}
		}
		expect(depthOrder(actors).map((actor) => actor.id)).toEqual(order);
		expect(actors.map((actor) => actor.phase)).toEqual(phases);
	});
	it("preserves surviving actors across resize instead of restarting", () => {
		const actors = createActors(1440, 16);
		for (const actor of actors) advanceActor(actor, 0.05, 1440, 200);
		const resized = resizeActors(actors, 1440, 390, 16);
		for (const actor of resized) {
			const before = actors.find((value) => value.id === actor.id);
			expect(actor.phase).toBe(before?.phase);
			expect(actor.direction).toBe(before?.direction);
			expect(actor.speed).toBe(before?.speed);
			expect((actor.x + 160) / 710).toBeCloseTo(((before?.x ?? 0) + 160) / 1760);
		}
	});
});
