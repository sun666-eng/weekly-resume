export type PlaybackFlags = {
	visible: boolean;
	documentVisible: boolean;
	ready: boolean;
	reduced: boolean;
	paused: boolean;
};
type PlaybackOptions = {
	request: (callback: FrameRequestCallback) => number;
	cancel: (id: number) => void;
	render: (activeTime: number, dt: number) => void;
	fps: number;
	onError?: (error: unknown) => void;
};

/** One cancellable clock per decoration; paused/hidden time never advances its simulation. */
export function createPlayback(options: PlaybackOptions) {
	let flags: PlaybackFlags = { visible: false, documentVisible: true, ready: false, reduced: false, paused: false };
	let frame: number | null = null;
	let last: number | null = null;
	let activeTime = 0;
	let renders = 0;
	let dirty = true;
	let disposed = false;
	let failed = false;
	const visible = () => flags.visible && flags.documentVisible && flags.ready && !disposed && !failed;
	const running = () => visible() && !flags.reduced && !flags.paused;
	const cancel = () => {
		if (frame !== null) options.cancel(frame);
		frame = null;
		last = null;
	};
	const draw = (dt: number) => {
		try {
			activeTime += dt;
			options.render(activeTime, dt);
			renders++;
			dirty = false;
		} catch (error) {
			failed = true;
			cancel();
			options.onError?.(error);
		}
	};
	const tick = (timestamp: number) => {
		frame = null;
		if (!running()) return;
		if (last === null) last = timestamp;
		const elapsed = timestamp - last;
		if (elapsed >= 1000 / options.fps - 0.5) {
			last = timestamp;
			draw(Math.min(elapsed / 1000, 0.05));
		}
		if (running()) frame = options.request(tick);
	};
	const sync = () => {
		if (!running()) cancel();
		if (visible() && dirty) draw(0);
		if (running() && frame === null) frame = options.request(tick);
	};
	return {
		setFlags(next: Partial<PlaybackFlags>) {
			flags = { ...flags, ...next };
			sync();
		},
		invalidate() {
			dirty = true;
			sync();
		},
		snapshot: () => ({
			...flags,
			running: running(),
			scheduled: frame !== null,
			activeTime,
			renders,
			disposed,
			failed,
		}),
		dispose() {
			disposed = true;
			cancel();
		},
	};
}

export type Playback = ReturnType<typeof createPlayback>;
