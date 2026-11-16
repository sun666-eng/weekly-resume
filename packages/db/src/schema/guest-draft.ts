import * as pg from "drizzle-orm/pg-core";
import { user } from "./auth";
import { resume } from "./resume";

// Keep the claim when its resume is deleted: old retries must not resurrect it.
export const guestDraftClaim = pg.pgTable(
	"guest_draft_claim",
	{
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		draftId: pg.text("draft_id").notNull(),
		revision: pg.integer("revision").notNull(),
		fingerprint: pg.text("fingerprint").notNull(),
		resumeId: pg.text("resume_id").references(() => resume.id, { onDelete: "set null" }),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [pg.primaryKey({ columns: [t.userId, t.draftId] })],
);

// Written before any external write. Reclamation and committing a reference lock this row.
export const guestPhotoAttempt = pg.pgTable(
	"guest_photo_attempt",
	{
		id: pg.text("id").primaryKey(),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		key: pg.text("key").notNull().unique(),
		state: pg.text("state").notNull().default("preparing"),
		leaseUntil: pg.timestamp("lease_until", { withTimezone: true }).notNull(),
		expiresAt: pg.timestamp("expires_at", { withTimezone: true }).notNull(),
		resumeId: pg.text("resume_id").references(() => resume.id, { onDelete: "set null" }),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [pg.index().on(t.state, t.expiresAt)],
);
