/** Retain the writer identity across reloads, but never share it with a duplicated live tab. */
export async function acquireGuestWriter(draftId: string): Promise<{ id: string; release: () => void }> {
	if (!navigator.locks) return { id: crypto.randomUUID(), release: () => undefined };
	let id: string;
	try {
		id = sessionStorage.getItem(`guest-writer:${draftId}`) ?? crypto.randomUUID();
	} catch {
		id = crypto.randomUUID();
	}
	const acquire = (candidate: string): Promise<{ id: string; release: () => void } | null> =>
		new Promise((resolve, reject) => {
			void navigator.locks
				.request(`weekly-resume-writer:${candidate}`, { ifAvailable: true }, async (lock) => {
					if (!lock) {
						resolve(null);
						return;
					}
					await new Promise<void>((release) => resolve({ id: candidate, release }));
				})
				.catch(reject);
		});
	const writer = (await acquire(id)) ?? (await acquire(crypto.randomUUID()));
	if (!writer) throw new Error("WRITER_UNAVAILABLE");
	try {
		sessionStorage.setItem(`guest-writer:${draftId}`, writer.id);
	} catch {
		/* Registry remains conservative. */
	}
	return writer;
}

/** Hold unused writer locks until the caller's CAS transaction removes their stale registrations. */
export async function withInactiveGuestWriters<T>(
	writers: readonly string[],
	currentId: string,
	run: (inactive: string[]) => Promise<T>,
): Promise<T> {
	if (!navigator.locks) return run([]);
	const inactive: string[] = [];
	const releases: Array<() => void> = [];
	try {
		for (const id of new Set(writers)) {
			if (id === currentId) continue;
			await new Promise<void>((resolve, reject) => {
				void navigator.locks
					.request(`weekly-resume-writer:${id}`, { ifAvailable: true }, async (lock) => {
						if (!lock) return resolve();
						await new Promise<void>((release) => {
							inactive.push(id);
							releases.push(release);
							resolve();
						});
					})
					.catch(reject);
			});
		}
		return await run(inactive);
	} finally {
		for (const release of releases) release();
	}
}
