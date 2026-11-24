import { useSyncExternalStore } from "react";

let unloading = false;
const listeners = new Set<() => void>();

function setUnloading(value: boolean) {
	if (unloading === value) return;
	unloading = value;
	for (const notify of listeners) notify();
}

if (typeof window !== "undefined") {
	// Layers can unmount and remount between beforeunload and pagehide.
	// Keep the signal for the lifetime of the document, including that gap.
	window.addEventListener("beforeunload", () => setUnloading(true));
	window.addEventListener("pagehide", () => setUnloading(true));
	window.addEventListener("pageshow", () => setUnloading(false));

	const resumeAfterInput = (event: Event) => {
		if (event.isTrusted && document.visibilityState === "visible") setUnloading(false);
	};
	// Cancelling a native navigation prompt keeps the current page without a pageshow.
	window.addEventListener("pointerdown", resumeAfterInput, true);
	window.addEventListener("keydown", resumeAfterInput, true);
}

function subscribe(notify: () => void) {
	listeners.add(notify);
	return () => {
		listeners.delete(notify);
	};
}

export const isPageUnloading = () => unloading;
export const usePageUnloading = () => useSyncExternalStore(subscribe, isPageUnloading, () => false);
