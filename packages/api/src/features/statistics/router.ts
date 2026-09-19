import z from "zod";
import { publicProcedure } from "../../context";
import { statisticsService } from "./service";

const nullableTotal = z
	.number()
	.nullable()
	.describe("Total rows in the table, or null when the count is temporarily unavailable.");

export const statisticsRouter = {
	getTotals: publicProcedure
		.route({
			method: "GET",
			path: "/statistics",
			tags: ["Platform Statistics"],
			operationId: "getStatisticsTotals",
			summary: "Get user and resume totals with their cache timestamp",
		})
		.output(
			z.object({
				users: nullableTotal,
				resumes: nullableTotal,
				cachedAt: z
					.number()
					.nullable()
					.describe(
						"Oldest count's cache timestamp in Unix milliseconds, or null when totals are uncached or unavailable.",
					),
			}),
		)
		.handler(() => statisticsService.getTotals()),
};
