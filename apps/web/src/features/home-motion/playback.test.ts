import { describe, expect, it, vi } from "vitest";
import { createPlayback } from "./playback";

function clock() {
	const callbacks = new Map<number, FrameRequestCallback>();
	let id = 0;
	const render = vi.fn();
	const playback = createPlayback({
		fps: 30,
		render,
		request: (callback) => {
			callbacks.set(++id, callback);
			return id;
		},
		cancel: (handle) => {
			callbacks.delete(handle);
		},
	});
	return {
		playback,
		render,
		callbacks,
		tick(time: number) {
			const pending = [...callbacks.values()];
			callbacks.clear();
			for (const callback of pending) callback(time);
		},
	};
}

describe("motion lifecycle clock", () => {
	it("stays static for initial reduced motion and reacts to live preference changes", () => {
		const c = clock();
		c.playback.setFlags({ visible: true, ready: true, reduced: true });
		expect(c.render).toHaveBeenCalledTimes(1);
		expect(c.callbacks.size).toBe(0);
		c.playback.setFlags({ reduced: false });
		expect(c.callbacks.size).toBe(1);
		c.tick(0);
		c.tick(34);
		expect(c.render).toHaveBeenCalledTimes(2);
		c.playback.setFlags({ reduced: true });
		expect(c.callbacks.size).toBe(0);
	});
	it("manual pause wins over resource readiness, visibility and system preference", () => {
		const c = clock();
		c.playback.setFlags({ paused: true, visible: true, ready: true });
		c.playback.setFlags({ documentVisible: false });
		c.playback.setFlags({ documentVisible: true, reduced: false });
		c.playback.setFlags({ visible: false });
		c.playback.setFlags({ visible: true });
		expect(c.callbacks.size).toBe(0);
		expect(c.render).toHaveBeenCalledTimes(1);
		c.playback.setFlags({ paused: false });
		expect(c.callbacks.size).toBe(1);
	});
	it("does no hidden/offscreen work, excludes hidden time, clamps long frames", () => {
		const c = clock();
		c.playback.setFlags({ ready: true });
		expect(c.render).not.toHaveBeenCalled();
		c.playback.setFlags({ visible: true });
		c.tick(100);
		c.tick(134);
		const before = c.playback.snapshot();
		c.playback.setFlags({ visible: false });
		c.playback.invalidate();
		c.tick(30000);
		expect(c.playback.snapshot().activeTime).toBe(before.activeTime);
		expect(c.callbacks.size).toBe(0);
		c.playback.setFlags({ visible: true });
		c.tick(30000);
		c.tick(30034);
		expect(c.playback.snapshot().activeTime).toBeCloseTo(before.activeTime + 0.034);
		c.tick(90000);
		expect(c.playback.snapshot().activeTime).toBeCloseTo(before.activeTime + 0.084);
	});
	it("never schedules two loops and disposal is final through repeated remounts", () => {
		for (let i = 0; i < 10; i++) {
			const c = clock();
			c.playback.setFlags({ visible: true, ready: true });
			c.playback.setFlags({ visible: true });
			c.playback.invalidate();
			expect(c.callbacks.size).toBe(1);
			c.playback.dispose();
			c.playback.setFlags({ visible: true });
			c.playback.invalidate();
			expect(c.callbacks.size).toBe(0);
			expect(c.playback.snapshot().disposed).toBe(true);
		}
	});
	it("stops a failing renderer without breaking the page", () => {
		const onError = vi.fn();
		const request = vi.fn();
		const playback = createPlayback({
			fps: 30,
			request,
			cancel: vi.fn(),
			render: () => {
				throw new Error("Canvas failed");
			},
			onError,
		});
		playback.setFlags({ visible: true, ready: true });
		expect(playback.snapshot().failed).toBe(true);
		expect(request).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
