import { useCallback, useEffect, useRef } from "react";

/** Owns async upload lifetimes, including requests superseded before cropping finishes. */
export function usePictureUploadTasks() {
	const generation = useRef(0);
	const cleanups = useRef(new Set<() => void>());
	const invalidate = useCallback(() => {
		generation.current += 1;
		for (const cleanup of cleanups.current) cleanup();
		cleanups.current.clear();
		return generation.current;
	}, []);
	useEffect(
		() => () => {
			invalidate();
		},
		[invalidate],
	);
	return {
		invalidate,
		isCurrent: (id: number) => generation.current === id,
		track: (cleanup: () => void) => {
			const finish = () => {
				if (!cleanups.current.delete(finish)) return;
				cleanup();
			};
			cleanups.current.add(finish);
			return finish;
		},
	};
}
