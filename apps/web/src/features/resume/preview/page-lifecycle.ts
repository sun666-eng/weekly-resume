import { useSyncExternalStore } from "react";

let unloading = false;
const listeners = new Set<() => void>();

function setUnloading(value: boolean) {
	if (unloading === value) return;
	unloading = value;
	for (const notify of listeners) notify();
}

const onPageHide = () => setUnloading(true);
const onPageShow = () => setUnloading(false);

function onBeforeUnload(event: BeforeUnloadEvent) {
	setUnloading(true);
	// A draft navigation prompt may keep this document alive without a pageshow.
	window.setTimeout(() => {
		if (event.defaultPrevented && document.visibilityState === "visible") setUnloading(false);
	}, 0);
}

function subscribe(notify: () => void) {
	listeners.add(notify);
	if (listeners.size === 1) {
		window.addEventListener("beforeunload", onBeforeUnload);
		window.addEventListener("pagehide", onPageHide);
		window.addEventListener("pageshow", onPageShow);
	}

	return () => {
		listeners.delete(notify);
		if (listeners.size > 0) return;
		window.removeEventListener("beforeunload", onBeforeUnload);
		window.removeEventListener("pagehide", onPageHide);
		window.removeEventListener("pageshow", onPageShow);
		unloading = false;
	};
}

export const isPageUnloading = () => unloading;
export const usePageUnloading = () => useSyncExternalStore(subscribe, isPageUnloading, () => false);
