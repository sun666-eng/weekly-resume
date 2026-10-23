// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { withInactiveGuestWriters } from "./writer";

afterEach(() => vi.unstubAllGlobals());

function lockFixture(held: Set<string>) {
	vi.stubGlobal("navigator", {
		locks: {
			request: async (
				name: string,
				options: { ifAvailable: boolean },
				callback: (lock: { name: string } | null) => Promise<void>,
			) => {
				expect(options.ifAvailable).toBe(true);
				if (held.has(name)) return callback(null);
				held.add(name);
				try {
					return await callback({ name });
				} finally {
					held.delete(name);
				}
			},
		},
	});
}

describe("inactive guest writer cleanup", () => {
	it("protects live writers and holds stale locks through the storage transaction", async () => {
		const held = new Set(["weekly-resume-writer:self", "weekly-resume-writer:other-live"]);
		lockFixture(held);
		const result = await withInactiveGuestWriters(["self", "closed", "other-live", "closed"], "self", async (ids) => {
			expect(ids).toEqual(["closed"]);
			expect(held.has("weekly-resume-writer:closed")).toBe(true);
			await Promise.resolve();
			expect(held.has("weekly-resume-writer:closed")).toBe(true);
			return "committed";
		});
		await Promise.resolve();
		expect(result).toBe("committed");
		expect([...held]).toEqual(["weekly-resume-writer:self", "weekly-resume-writer:other-live"]);
	});

	it("releases only its own locks when a transaction fails", async () => {
		const held = new Set(["weekly-resume-writer:other-live"]);
		lockFixture(held);
		await expect(
			withInactiveGuestWriters(["closed", "other-live"], "self", () =>
				Promise.reject(new Error("transaction aborted")),
			),
		).rejects.toThrow("transaction aborted");
		await Promise.resolve();
		expect([...held]).toEqual(["weekly-resume-writer:other-live"]);
	});

	it("keeps all registrations when Web Locks cannot establish inactivity", async () => {
		vi.stubGlobal("navigator", {});
		await withInactiveGuestWriters(["unknown"], "self", (ids) => Promise.resolve(expect(ids).toEqual([])));
	});
});
