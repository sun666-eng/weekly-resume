import { env } from "@reactive-resume/env/server";
import { publicProcedure } from "../../context";
import { crudRouter } from "./crud";
import { updatesRouter } from "./event-router";
import { guestClaimRouter } from "./guest-claim";
import { getRootResume } from "./root";
import { sharingRouter } from "./sharing";
import { resumeStatisticsRouter } from "./statistics";
import { tagsRouter } from "./tags";
import { versionsRouter } from "./versions";

export const resumeRouter = {
	...guestClaimRouter,
	guestConfig: publicProcedure.handler(() => ({
		enabled: env.FLAG_ENABLE_GUEST_BUILDER,
		origin: new URL(env.APP_URL).origin,
	})),
	getRoot: publicProcedure.handler(({ context }) =>
		getRootResume({
			requestHeaders: context.reqHeaders,
			...(context.user?.id ? { currentUserId: context.user.id } : {}),
		}),
	),
	tags: tagsRouter,
	statistics: resumeStatisticsRouter,
	updates: updatesRouter,

	list: crudRouter.list,
	getById: crudRouter.getById,
	getBySlug: sharingRouter.getBySlug,
	create: crudRouter.create,
	import: crudRouter.import,
	update: crudRouter.update,
	patch: crudRouter.patch,
	setLocked: crudRouter.setLocked,
	setPassword: sharingRouter.setPassword,
	verifyPassword: sharingRouter.verifyPassword,
	removePassword: sharingRouter.removePassword,
	duplicate: crudRouter.duplicate,
	delete: crudRouter.delete,
	listVersions: versionsRouter.listVersions,
	restoreVersion: versionsRouter.restoreVersion,
};
