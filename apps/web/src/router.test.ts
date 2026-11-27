import { expect, it, vi } from "vitest";
import { loadRootContext } from "./libs/root-context";
import { getRouter } from "./router";

vi.mock("./libs/root-context", () => ({
	loadRootContext: vi.fn(async () => ({ theme: "light", locale: "zh-CN", session: null, flags: {} })),
}));
vi.mock("./routeTree.gen", async () => {
	const { createRootRoute } = await import("@tanstack/react-router");
	return { routeTree: createRootRoute() };
});

it("disables global view transitions for scrollable routes", async () => {
	const router = await getRouter();
	expect(router.options.defaultViewTransition).toBe(false);
});

it("retries a transient WebKit bootstrap read once and surfaces a persistent failure", async () => {
	const load = vi.mocked(loadRootContext);
	load.mockClear().mockRejectedValueOnce(new TypeError("Load failed"));
	await expect(getRouter()).resolves.toBeDefined();
	expect(load).toHaveBeenCalledTimes(2);

	const failure = new TypeError("Load failed");
	load.mockClear().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
	await expect(getRouter()).rejects.toBe(failure);
	expect(load).toHaveBeenCalledTimes(2);
});
