import type { Redis as RedisClient } from "ioredis";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { ORPCError } from "@orpc/client";
import { SYSTEM_AI_PROVIDER_ID } from "@reactive-resume/ai/types";
import { env } from "@reactive-resume/env/server";

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET = 8 * 3_600_000;
const exhausted = () =>
	new ORPCError("AI_FREE_QUOTA_EXCEEDED", {
		status: 429,
		message: "Your free AI quota is used up for today. Try again tomorrow or connect your own API key in Settings.",
	});

// Check both counters before incrementing either. An IP rejection must not spend a user's allowance.
const RESERVE = `
for i, key in ipairs(KEYS) do
  if tonumber(redis.call("GET", key) or "0") >= tonumber(ARGV[i]) then return 0 end
end
for _, key in ipairs(KEYS) do
  redis.call("INCR", key)
  redis.call("EXPIREAT", key, ARGV[#KEYS+1])
end
return 1`;

let client: RedisClient | undefined;
let currentDay = -1;
const counts = new Map<string, number>();

function counters(userId: string, trustedClient?: string) {
	const day = Math.floor((Date.now() + SHANGHAI_OFFSET) / DAY_MS);
	if (currentDay !== day) {
		counts.clear();
		currentDay = day;
	}
	const key = (kind: string, id: string) =>
		`weekly-resume:free-ai:{${day}}:${kind}:${createHash("sha256").update(id).digest("hex")}`;
	const buckets = [{ key: key("user", userId), limit: env.SYSTEM_AI_DAILY_LIMIT }];
	if (trustedClient && isIP(trustedClient)) {
		buckets.push({ key: key("ip", trustedClient), limit: Math.max(30, env.SYSTEM_AI_DAILY_LIMIT * 2) });
	}
	return { buckets, expires: ((day + 1) * DAY_MS - SHANGHAI_OFFSET) / 1000 };
}

function redis() {
	if (!env.REDIS_URL) return undefined;
	if (!client) {
		// The bundled server ships the Agent stream adapter. Resolve its Redis driver in the same scope.
		const requireDriver = createRequire(import.meta.resolve("resumable-stream/ioredis"));
		const { Redis } = requireDriver("ioredis") as typeof import("ioredis");
		client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
	}
	return client;
}

export async function consumeSystemQuota(providerId: string, userId: string, trustedClient?: string) {
	if (providerId !== SYSTEM_AI_PROVIDER_ID) return;
	const { buckets, expires } = counters(userId, trustedClient);
	const shared = redis();
	if (shared) {
		const reserved = await shared.eval(
			RESERVE,
			buckets.length,
			...buckets.map((bucket) => bucket.key),
			...buckets.map((bucket) => bucket.limit),
			expires,
		);
		if (reserved !== 1) throw exhausted();
		return;
	}
	// Synchronous check and increment for a single process. Redis failures never downgrade to this store.
	if (buckets.some(({ key, limit }) => (counts.get(key) ?? 0) >= limit)) throw exhausted();
	for (const { key } of buckets) counts.set(key, (counts.get(key) ?? 0) + 1);
}

export async function readSystemQuota(userId: string, trustedClient?: string) {
	const { buckets } = counters(userId, trustedClient);
	const keys = buckets.map((b) => b.key);
	const shared = redis();
	const used = shared ? (await shared.mget(...keys)).map(Number) : keys.map((k) => counts.get(k) ?? 0);
	return {
		dailyLimit: env.SYSTEM_AI_DAILY_LIMIT,
		usedToday: used[0] ?? 0,
		remainingToday: Math.max(0, Math.min(...buckets.map(({ limit }, i) => limit - (used[i] ?? 0)))),
	};
}
