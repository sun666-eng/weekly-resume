import type { Redis as RedisClient } from "ioredis";
import { createHash, randomUUID } from "node:crypto";
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
local n = #ARGV - 1
local receipt = KEYS[n+1]
local expiry = ARGV[n+1]
if receipt and redis.call("EXISTS", receipt) == 1 then return 1 end
for i = 1, n do
  if tonumber(redis.call("GET", KEYS[i]) or "0") >= tonumber(ARGV[i]) then return 0 end
end
for i = 1, n do
  redis.call("INCR", KEYS[i])
  redis.call("EXPIREAT", KEYS[i], expiry)
end
if receipt then
  redis.call("SET", receipt, "1")
  redis.call("EXPIREAT", receipt, expiry)
end
return 1`;

const REFUND = `
if redis.call("DEL", KEYS[#KEYS]) == 0 then return 0 end
for i = 1, #KEYS-1 do
  local key = KEYS[i]
  if tonumber(redis.call("GET", key) or "0") > 0 then redis.call("DECR", key) end
end
return 1`;

let client: RedisClient | undefined;
let currentDay = -1;
const counts = new Map<string, number>();

const shanghaiDay = () => Math.floor((Date.now() + SHANGHAI_OFFSET) / DAY_MS);

function counters(userId: string, trustedClient?: string) {
	const day = shanghaiDay();
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
	return { buckets, day, expires: ((day + 1) * DAY_MS - SHANGHAI_OFFSET) / 1000 };
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

export type SystemQuotaReservation = { refund: () => Promise<void> };

async function debitSystemQuota(
	providerId: string,
	userId: string,
	trustedClient: string | undefined,
	refundable: boolean,
): Promise<SystemQuotaReservation | null> {
	if (providerId !== SYSTEM_AI_PROVIDER_ID) return null;
	const { buckets, day, expires } = counters(userId, trustedClient);
	const keys = buckets.map(({ key }) => key);
	const shared = redis();
	// A driver reconnect can replay EVAL after Redis applied it. The receipt shares the counters' hash slot and expiry.
	const redisKeys = shared && refundable ? [...keys, `${keys[0]}:reservation:${randomUUID()}`] : keys;
	if (shared) {
		const reserved = await shared.eval(
			RESERVE,
			redisKeys.length,
			...redisKeys,
			...buckets.map((bucket) => bucket.limit),
			expires,
		);
		if (reserved !== 1) throw exhausted();
	} else {
		// Synchronous check and increment for a single process. Redis failures never downgrade to this store.
		if (buckets.some(({ key, limit }) => (counts.get(key) ?? 0) >= limit)) throw exhausted();
		for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	if (!refundable) return null;
	async function refund() {
		if (shared) {
			await shared.eval(REFUND, redisKeys.length, ...redisKeys);
		} else if (currentDay === day && shanghaiDay() === day) {
			for (const key of keys) {
				const used = counts.get(key) ?? 0;
				if (used > 0) counts.set(key, used - 1);
			}
		}
	}
	// Share even an in-flight or rejected refund: Redis may have applied it before a connection error.
	let refundPromise: Promise<void> | undefined;
	return { refund: () => (refundPromise ??= refund()) };
}

export function reserveSystemQuota(providerId: string, userId: string, trustedClient?: string) {
	return debitSystemQuota(providerId, userId, trustedClient, true);
}

export async function consumeSystemQuota(providerId: string, userId: string, trustedClient?: string): Promise<void> {
	await debitSystemQuota(providerId, userId, trustedClient, false);
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
