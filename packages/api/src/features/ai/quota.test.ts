import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Redis } from "ioredis";
import { SYSTEM_AI_PROVIDER_ID } from "@reactive-resume/ai/types";
import { consumeSystemQuota, readSystemQuota } from "./quota";

const { config, evalQuota, readKeys } = vi.hoisted(() => ({
	config: { SYSTEM_AI_DAILY_LIMIT: 15, REDIS_URL: "" },
	evalQuota: vi.fn(),
	readKeys: vi.fn(),
}));
vi.mock("@reactive-resume/env/server", () => ({ env: config }));
const spend = (user: string, ip?: string) => consumeSystemQuota(SYSTEM_AI_PROVIDER_ID, user, ip);
const exhausted = { code: "AI_FREE_QUOTA_EXCEEDED", status: 429 };
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-18T15:59:59Z"));
	config.REDIS_URL = "";
	vi.clearAllMocks();
	vi.spyOn(Redis.prototype, "eval").mockImplementation(evalQuota);
	vi.spyOn(Redis.prototype, "mget").mockImplementation(readKeys);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});
describe("Shanghai daily system quota", () => {
	it("allows exactly fifteen concurrent submissions and resets at Shanghai midnight", async () => {
		const runs = await Promise.allSettled(Array.from({ length: 16 }, () => spend("one")));
		expect(runs.filter((run) => run.status === "fulfilled")).toHaveLength(15);
		expect(runs.filter((run) => run.status === "rejected")).toMatchObject([{ reason: exhausted }]);
		await expect(readSystemQuota("one")).resolves.toEqual({ usedToday: 15, dailyLimit: 15, remainingToday: 0 });
		vi.setSystemTime(new Date("2026-11-18T16:00:00Z"));
		await expect(spend("one")).resolves.toBeUndefined();
		await expect(readSystemQuota("one")).resolves.toMatchObject({ usedToday: 1, remainingToday: 14 });
	});
	it("shares the IP cap across accounts and only spends both counters together", async () => {
		const ip = "192.0.2.10";
		await Promise.all(Array.from({ length: 30 }, (_, i) => spend(`ip-user-${i % 2}`, ip)));
		await expect(spend("fresh", ip)).rejects.toMatchObject(exhausted);
		await expect(readSystemQuota("fresh", ip)).resolves.toMatchObject({ usedToday: 0, remainingToday: 0 });
		await expect(readSystemQuota("fresh", "192.0.2.11")).resolves.toMatchObject({ usedToday: 0, remainingToday: 15 });
		await expect(consumeSystemQuota("personal", "fresh", ip)).resolves.toBeUndefined();
	});
	it("does not group unknown addresses into a shared quota", async () => {
		await Promise.all(Array.from({ length: 32 }, (_, i) => spend(`anon-ip-${i}`, "unknown")));
		await expect(readSystemQuota("anon-ip-31", "unknown")).resolves.toMatchObject({ remainingToday: 14 });
	});
	it("reserves shared keys atomically with the next midnight expiry, and fails closed when Redis fails", async () => {
		config.REDIS_URL = "redis://synthetic.invalid";
		evalQuota.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockRejectedValueOnce(new Error("unavailable"));
		await spend("redis-user", "198.51.100.6");
		const [lua, count, userKey, ipKey, userLimit, ipLimit, expiry] = evalQuota.mock.calls[0] ?? [];
		expect(lua).toContain('redis.call("INCR"');
		expect(lua).toContain('redis.call("EXPIREAT"');
		expect([count, userLimit, ipLimit, expiry]).toEqual([2, 15, 30, Date.parse("2026-11-18T16:00:00Z") / 1000]);
		expect(userKey).toMatch(/\{\d+\}:user:[a-f0-9]{64}$/);
		expect(ipKey).toContain(`${userKey.split(":user:")[0]}:ip:`);
		await expect(spend("redis-user", "198.51.100.6")).rejects.toMatchObject(exhausted);
		await expect(spend("redis-user", "198.51.100.6")).rejects.toThrow("unavailable");
		readKeys.mockResolvedValueOnce(["2", "29"]);
		await expect(readSystemQuota("redis-user", "198.51.100.6")).resolves.toMatchObject({
			usedToday: 2,
			remainingToday: 1,
		});
		expect(readKeys).toHaveBeenCalledWith(userKey, ipKey);
		await consumeSystemQuota("personal", "redis-user", "198.51.100.6");
		expect(evalQuota).toHaveBeenCalledTimes(3);
	});
});
