CREATE TABLE "app_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "co_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'coadmin' NOT NULL,
	"is_active" boolean DEFAULT true,
	"call_count" integer DEFAULT 0 NOT NULL,
	"cycle_entry_count" integer DEFAULT 0 NOT NULL,
	"cycle_approve_count" integer DEFAULT 0 NOT NULL,
	"cycle_reject_count" integer DEFAULT 0 NOT NULL,
	"cycle_call_count" integer DEFAULT 0 NOT NULL,
	"cycle_start_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "co_admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "credit_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"credits" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "credit_payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"free_credits" integer DEFAULT 5,
	"purchased_credits" integer DEFAULT 0,
	"last_free_reset" timestamp DEFAULT now(),
	"credits_frozen" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"co_admin_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"post" varchar(255) NOT NULL,
	"education" varchar(255),
	"description" text,
	"profile_photo" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"job_name" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(300) NOT NULL,
	"state" varchar(100),
	"district" varchar(100),
	"work_type" varchar(50) DEFAULT 'field',
	"salary" varchar(100),
	"work_hours" varchar(100),
	"num_employees" varchar(50),
	"contact_phone" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"low_credit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pending_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"service_name" varchar(255) NOT NULL,
	"description" text,
	"mobile" varchar(20),
	"mobile_numbers" jsonb DEFAULT '[]'::jsonb,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"address" text,
	"state" varchar(100),
	"district" varchar(100),
	"latitude" real,
	"longitude" real,
	"radius_km" integer DEFAULT 10,
	"approx_charge" varchar(100),
	"profile_photo" text,
	"is_hidden" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"added_by" varchar(100) NOT NULL,
	"verified_by" varchar(100),
	"group_label" varchar(5),
	"source" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promo_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_code" varchar(50) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"used_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"approve_count" integer DEFAULT 0 NOT NULL,
	"reject_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"total_actions" integer DEFAULT 0 NOT NULL,
	"rate_per_action" integer DEFAULT 3 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"cycle_start" timestamp,
	"cycle_end" timestamp DEFAULT now(),
	"paid_by_admin" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" varchar(255) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_searched" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "site_content_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tag_jobs" (
	"job_id" varchar(32) PRIMARY KEY NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"from_dict" integer DEFAULT 0 NOT NULL,
	"from_ai" integer DEFAULT 0 NOT NULL,
	"from_hybrid" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"gemini_available" boolean DEFAULT false NOT NULL,
	"error_sample" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visitor_stats_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "code" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "type" SET DEFAULT 'admin';--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "charge_reason" varchar(30) DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "credits_charged" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "local_users" ADD COLUMN "is_blocked" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "longitude" real;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "accept_double_charge" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "credit_amount" integer DEFAULT 25;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "state" varchar(100);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "district" varchar(100);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "profile_photo" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "is_hidden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "added_by" varchar(100) DEFAULT 'self';--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "approved_by" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX "credits_user_role_idx" ON "credits" USING btree ("user_id","role");