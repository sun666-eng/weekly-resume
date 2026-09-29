// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePictureUploadTasks } from "./picture-upload";

describe("picture upload lifetimes", () => {
	it("rejects an upload completion after deletion invalidates it", async () => {
		const { result } = renderHook(usePictureUploadTasks);
		const request = result.current.invalidate();
		let resolve!: (url: string) => void;
		const response = new Promise<string>((done) => {
			resolve = done;
		});
		const persist = vi.fn();
		const completion = response.then((url) => {
			if (result.current.isCurrent(request)) persist(url);
		});
		act(() => {
			result.current.invalidate();
		});
		resolve("/api/uploads/old.png");
		await completion;
		expect(persist).not.toHaveBeenCalled();
	});

	it("accepts only the latest selection across rerenders", () => {
		const { result, rerender } = renderHook(usePictureUploadTasks);
		const first = result.current.invalidate();
		const second = result.current.invalidate();
		rerender();
		expect(result.current.isCurrent(first)).toBe(false);
		expect(result.current.isCurrent(second)).toBe(true);
	});

	it("closes loading feedback exactly once on cancellation and late completion", () => {
		const { result } = renderHook(usePictureUploadTasks);
		const close = vi.fn();
		const finish = result.current.track(close);
		result.current.invalidate();
		finish();
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("invalidates pending work and closes feedback on unmount", () => {
		const { result, unmount } = renderHook(usePictureUploadTasks);
		const tasks = result.current;
		const request = tasks.invalidate();
		const close = vi.fn();
		tasks.track(close);
		unmount();
		expect(tasks.isCurrent(request)).toBe(false);
		expect(close).toHaveBeenCalledTimes(1);
	});
});
