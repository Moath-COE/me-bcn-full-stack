CREATE TABLE "livekit_webhook_event" (
	"id" text PRIMARY KEY,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_session_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "study_session_presence_session_idx" ON "study_session_presence" ("session_id");--> statement-breakpoint
ALTER TABLE "study_session_presence" ADD CONSTRAINT "study_session_presence_session_id_study_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "study_session" DROP CONSTRAINT "study_session_end_reason_check", ADD CONSTRAINT "study_session_end_reason_check" CHECK ("end_reason" IN ('superseded', 'no_leave_event'));