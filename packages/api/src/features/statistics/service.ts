import { count } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// ponytail: file-based disk cache replaced with module-level memo
const memCache = new Map<string, { value: number; cachedAt: number }>();

/** Clear all cached statistics. Exposed for test isolation only. */
export const clearStatisticsCache = () => memCache.clear();

const getCached = (key: string) => {
	const entry = memCache.get(key);
	if (!entry || Date.now() - entry.cachedAt >= CACHE_DURATION_MS) return null;
	return entry;
};

const setCached = (key: string, value: number) => {
	memCache.set(key, { value, cachedAt: Date.now() });
};

const getCountFromDatabase = async (table: typeof schema.user | typeof schema.resume): Promise<number | null> => {
	try {
		const [result] = await db.select({ count: count() }).from(table);
		if (!result) return null;
		return result.count;
	} catch {
		// Report unavailability instead of a stale or fabricated total.
		return null;
	}
};

const getCachedCount = async (key: string): Promise<number | null> => {
	const cached = getCached(key);
	if (cached !== null) return cached.value;

	const table = key === "users" ? schema.user : schema.resume;
	const value = await getCountFromDatabase(table);
	if (value !== null) setCached(key, value);
	return value;
};

export const statisticsService = {
	getTotals: async () => {
		const [users, resumes] = await Promise.all([
			statisticsService.user.getCount(),
			statisticsService.resume.getCount(),
		]);
		const usersCache = users === null ? null : getCached("users");
		const resumesCache = resumes === null ? null : getCached("resumes");

		return {
			users,
			resumes,
			// Use the older count's timestamp so the pair never looks fresher than either total.
			cachedAt:
				usersCache?.value === users && resumesCache?.value === resumes
					? Math.min(usersCache.cachedAt, resumesCache.cachedAt)
					: null,
		};
	},
	user: {
		getCount: () => {
			return getCachedCount("users");
		},
	},
	resume: {
		getCount: () => {
			return getCachedCount("resumes");
		},
	},
};
