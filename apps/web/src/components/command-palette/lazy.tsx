import { lazy, Suspense, useEffect, useState } from "react";
import { useCommandPaletteStore } from "@/features/command-palette/store";

const CommandPalette = lazy(() =>
	import("@/features/command-palette").then((module) => ({ default: module.CommandPalette })),
);

/** The small activation listener stays mounted; the palette owns shortcuts after it loads. */
export function LazyCommandPalette() {
	const open = useCommandPaletteStore((state) => state.open);
	const [activated, setActivated] = useState(false);
	const enabled = activated || open;

	useEffect(() => {
		if (open) setActivated(true);
	}, [open]);

	useEffect(() => {
		const onOpen = () => {
			setActivated(true);
			useCommandPaletteStore.getState().setOpen(true);
		};
		window.addEventListener("open-command-palette", onOpen);
		return () => window.removeEventListener("open-command-palette", onOpen);
	}, []);

	useEffect(() => {
		if (enabled) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return;
			if (event.key.toLowerCase() !== "k") return;
			event.preventDefault();
			setActivated(true);
			useCommandPaletteStore.getState().setOpen(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled]);

	return enabled ? (
		<Suspense fallback={null}>
			<CommandPalette />
		</Suspense>
	) : null;
}
