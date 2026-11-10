CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution" (
	"id" text PRIMARY KEY,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "major" (
	"id" text PRIMARY KEY,
	"institution_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "institution_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "major_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_key" UNIQUE("phone_number");--> statement-breakpoint
CREATE INDEX "major_institution_id_idx" ON "major" ("institution_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_institution_id_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_major_id_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "major"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "major" ADD CONSTRAINT "major_institution_id_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE RESTRICT;