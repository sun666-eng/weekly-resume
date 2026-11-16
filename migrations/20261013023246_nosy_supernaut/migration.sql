CREATE TABLE "guest_draft_claim" (
	"user_id" text,
	"draft_id" text,
	"revision" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"resume_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_draft_claim_pkey" PRIMARY KEY("user_id","draft_id")
);
--> statement-breakpoint
CREATE TABLE "guest_photo_attempt" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"state" text DEFAULT 'preparing' NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resume_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "guest_photo_attempt_state_expires_at_index" ON "guest_photo_attempt" ("state","expires_at");--> statement-breakpoint
ALTER TABLE "guest_draft_claim" ADD CONSTRAINT "guest_draft_claim_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "guest_draft_claim" ADD CONSTRAINT "guest_draft_claim_resume_id_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "guest_photo_attempt" ADD CONSTRAINT "guest_photo_attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "guest_photo_attempt" ADD CONSTRAINT "guest_photo_attempt_resume_id_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;
