import { expect, it, vi } from "vitest";
import { getRouter } from "./router";

vi.mock("./libs/root-context", () => ({
	loadRootContext: async () => ({ theme: "light", locale: "zh-CN", session: null, flags: {} }),
}));
vi.mock("./routeTree.gen", async () => {
	const { createRootRoute } = await import("@tanstack/react-router");
	return { routeTree: createRootRoute() };
});

it("disables global view transitions for scrollable routes", async () => {
	const router = await getRouter();
	expect(router.options.defaultViewTransition).toBe(false);
});
