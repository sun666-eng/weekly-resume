// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandPaletteStore } from "@/features/command-palette/store";
import { LazyCommandPalette } from "./lazy";

const loaded = vi.hoisted(() => vi.fn());
vi.mock("@/features/command-palette", () => {
	loaded();
	return { CommandPalette: () => <div role="dialog">Synthetic command palette</div> };
});
afterEach(() => {
	cleanup();
	useCommandPaletteStore.getState().setOpen(false);
});

describe("command palette activation", () => {
	it("keeps the palette module unloaded until the first Ctrl+K", async () => {
		render(<LazyCommandPalette />);
		expect(loaded).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog")).toHaveTextContent("Synthetic command palette");
		expect(loaded).toHaveBeenCalledTimes(1);
		expect(useCommandPaletteStore.getState().open).toBe(true);
	});
	it("supports Cmd+K", async () => {
		render(<LazyCommandPalette />);
		fireEvent.keyDown(window, { key: "k", metaKey: true });
		expect(await screen.findByRole("dialog")).toBeVisible();
	});
	it("supports the custom event and workspace store interaction", async () => {
		render(<LazyCommandPalette />);
		act(() => window.dispatchEvent(new Event("open-command-palette")));
		expect(await screen.findByRole("dialog")).toBeVisible();
		cleanup();
		useCommandPaletteStore.getState().setOpen(false);
		render(<LazyCommandPalette />);
		act(() => useCommandPaletteStore.getState().setOpen(true));
		expect(await screen.findByRole("dialog")).toBeVisible();
	});
});
