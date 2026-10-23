import z from "zod";
import { guestOperationSchema, guestSnapshotSchema, isGuestOperationActive } from "@reactive-resume/resume/guest-draft";

export const guestRecordSchema = z
	.object({
		version: z.literal(1),
		draftId: z.uuid(),
		epoch: z.uuid(),
		revision: z.number().int().nonnegative(),
		savedAt: z.number(),
		snapshot: guestSnapshotSchema,
		writers: z.array(z.string()),
	})
	.strict();
export type GuestRecord = z.infer<typeof guestRecordSchema>;
export class GuestStorageConflict extends Error {}
const DB_NAME = "weekly-resume-guest-v1";

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore("records");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(new Error("LOCAL_STORAGE_UNAVAILABLE"));
		request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
	});
}

// All comparisons and writes happen inside one readwrite transaction, including retirement.
async function transaction<T>(run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const tx = database.transaction("records", "readwrite");
		let result: T;
		tx.oncomplete = () => {
			database.close();
			resolve(result);
		};
		tx.onabort = tx.onerror = () => {
			database.close();
			reject(new GuestStorageConflict("LOCAL_WRITE_FAILED_OR_CHANGED"));
		};
		try {
			run(tx.objectStore("records"), (value) => {
				result = value;
			});
		} catch {
			tx.abort();
		}
	});
}

export const readGuestRaw = () =>
	transaction<unknown>((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => done(request.result);
	});

export function openGuestRecord(candidate: GuestRecord | null, tabId: string): Promise<GuestRecord | null> {
	return transaction((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => {
			try {
				const existing = request.result != null ? guestRecordSchema.parse(request.result) : null;
				const value = existing ?? candidate;
				if (!value) {
					done(null);
					return;
				}
				const retired = store.get(`retired:${value.draftId}`);
				retired.onsuccess = () => {
					if (retired.result) {
						store.transaction.abort();
						return;
					}
					const next = { ...value, writers: Array.from(new Set([...value.writers, ...(tabId ? [tabId] : [])])) };
					store.put(next, "active");
					done(next);
				};
			} catch {
				store.transaction.abort();
			}
		};
	});
}

export function writeGuestRecord(base: GuestRecord, snapshot: GuestRecord["snapshot"], tabId: string) {
	return transaction<GuestRecord>((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => {
			const current = guestRecordSchema.safeParse(request.result);
			if (
				!current.success ||
				current.data.draftId !== base.draftId ||
				current.data.epoch !== base.epoch ||
				current.data.revision !== base.revision ||
				!current.data.writers.includes(tabId)
			) {
				store.transaction.abort();
				return;
			}
			const next = { ...current.data, snapshot, revision: current.data.revision + 1, savedAt: Date.now() };
			store.put(next, "active");
			done(next);
		};
	});
}

/** Only remove proven inactive writers, never data or a registration on a newer draft revision. */
export function removeInactiveGuestWriters(base: GuestRecord, inactive: readonly string[]) {
	if (inactive.length === 0) return Promise.resolve(false);
	return transaction<boolean>((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => {
			const current = guestRecordSchema.safeParse(request.result);
			if (
				!current.success ||
				current.data.draftId !== base.draftId ||
				current.data.epoch !== base.epoch ||
				current.data.revision !== base.revision
			) {
				done(false);
				return;
			}
			store.put({ ...current.data, writers: current.data.writers.filter((id) => !inactive.includes(id)) }, "active");
			done(true);
		};
	});
}

/** Release only after the caller has flushed and stopped accepting edits. */
export const releaseGuestWriter = (base: GuestRecord, tabId: string) =>
	transaction<boolean>((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => {
			const value = guestRecordSchema.safeParse(request.result);
			if (
				!value.success ||
				value.data.draftId !== base.draftId ||
				value.data.epoch !== base.epoch ||
				value.data.revision !== base.revision
			) {
				done(false);
				return;
			}
			store.put({ ...value.data, writers: value.data.writers.filter((id) => id !== tabId) }, "active");
			done(true);
		};
	});

export const retireGuestRecord = (base: GuestRecord, tabId: string) =>
	transaction<boolean>((store, done) => {
		const request = store.get("active");
		request.onsuccess = () => {
			const value = guestRecordSchema.safeParse(request.result);
			if (
				!value.success ||
				value.data.draftId !== base.draftId ||
				value.data.epoch !== base.epoch ||
				value.data.revision !== base.revision ||
				value.data.writers.some((id) => id !== tabId)
			) {
				done(false);
				return;
			}
			store.put({ epoch: base.epoch, retiredAt: Date.now() }, `retired:${base.draftId}`);
			store.delete("active");
			const cursor = store.openCursor();
			cursor.onsuccess = () => {
				const item = cursor.result;
				if (!item) {
					done(true);
					return;
				}
				if (String(item.key).startsWith("operation:") && item.value.draftId === base.draftId) item.delete();
				item.continue();
			};
		};
	});

export const putGuestOperation = (operation: z.infer<typeof guestOperationSchema>) =>
	transaction<void>((store, done) => {
		const value = guestOperationSchema.parse(operation);
		const request = store.get(`operation:${value.id}`);
		request.onsuccess = () => {
			const old = request.result ? guestOperationSchema.parse(request.result) : null;
			if (
				old &&
				(old.draftId !== value.draftId ||
					old.claimId !== value.claimId ||
					old.epoch !== value.epoch ||
					old.revision !== value.revision ||
					old.fingerprint !== value.fingerprint ||
					old.createdAt !== value.createdAt ||
					old.action !== value.action ||
					(old.accountId && value.accountId !== old.accountId) ||
					(old.state === "cancelled" && value.state !== "cancelled") ||
					(old.state === "attempted" && value.state !== "attempted" && value.state !== "cancelled"))
			) {
				store.transaction.abort();
				return;
			}
			store.put(value, `operation:${value.id}`);
			done();
		};
	});

/** Automatic continuation is consumed atomically; refreshing or another tab cannot replay it. */
export const consumeGuestContinuation = (id: string, accountId: string) =>
	transaction<boolean>((store, done) => {
		const request = store.get(`operation:${id}`);
		request.onsuccess = () => {
			const op = guestOperationSchema.safeParse(request.result);
			if (
				!op.success ||
				!isGuestOperationActive(op.data) ||
				op.data.accountId !== accountId ||
				op.data.state !== "claimed"
			) {
				done(false);
				return;
			}
			store.put({ ...op.data, state: "attempted" }, `operation:${id}`);
			done(true);
		};
	});
export const readGuestOperation = (id: string) =>
	transaction<z.infer<typeof guestOperationSchema> | null>((store, done) => {
		const request = store.get(`operation:${id}`);
		request.onsuccess = () => {
			const value = guestOperationSchema.safeParse(request.result);
			done(value.success ? value.data : null);
		};
	});
