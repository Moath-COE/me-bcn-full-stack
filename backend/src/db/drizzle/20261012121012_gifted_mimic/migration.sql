CREATE TYPE "enrollment_end_reason" AS ENUM('unenrolled');--> statement-breakpoint
CREATE TABLE "chapter" (
	"course_id" text,
	"number" integer,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"minutes" integer NOT NULL,
	"lesson_count" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_pkey" PRIMARY KEY("course_id","number"),
	CONSTRAINT "chapter_number_check" CHECK ("number" >= 1),
	CONSTRAINT "chapter_minutes_check" CHECK ("minutes" > 0),
	CONSTRAINT "chapter_lesson_count_check" CHECK ("lesson_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"institution_id" text NOT NULL,
	"icon" text NOT NULL,
	"tone" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_id_slug_check" CHECK ("id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
	CONSTRAINT "course_icon_check" CHECK ("icon" IN ('coins', 'bars', 'blocks', 'torus', 'flask', 'atom', 'donut', 'cube', 'bolt')),
	CONSTRAINT "course_tone_check" CHECK ("tone" IN ('lilac', 'base', 'deep', 'amber', 'walnut', 'olive', 'oliveDark'))
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"end_reason" "enrollment_end_reason",
	CONSTRAINT "enrollment_end_check" CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "course_institution_id_sort_idx" ON "course" ("institution_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_active_user_course_uidx" ON "enrollment" ("user_id","course_id") WHERE "ended_at" IS NULL;--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_institution_id_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT;