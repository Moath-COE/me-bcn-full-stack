ALTER TABLE "plan" ADD COLUMN "price_halalas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "is_listed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "badge_ar" text;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "badge_en" text;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_price_halalas_check" CHECK ("price_halalas" >= 0);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_badge_pair_check" CHECK (("badge_ar" IS NULL) = ("badge_en" IS NULL));