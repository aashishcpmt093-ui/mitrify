CREATE TABLE IF NOT EXISTS "calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"duration" integer DEFAULT 0,
	"payment_status" varchar(20) DEFAULT 'free'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "local_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"username" varchar(100),
	"password" varchar(255),
	"role" varchar(20) DEFAULT 'customer' NOT NULL,
	"auth_method" varchar(20) DEFAULT 'password' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "local_users_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "local_users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "local_users_email_unique" UNIQUE("email"),
	CONSTRAINT "local_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'customer' NOT NULL,
	"name" varchar(255) NOT NULL,
	"mobile" varchar(20),
	"is_blocked" boolean DEFAULT false,
	"promo_code" varchar(20),
	"referred_by" varchar(20),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_promo_code_unique" UNIQUE("promo_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"owner_id" varchar,
	"usage_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"type" varchar(20) DEFAULT 'referral',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"service_name" varchar(255) NOT NULL,
	"description" text,
	"hashtags" text[],
	"radius_km" integer DEFAULT 10,
	"approx_charge" varchar(100),
	"mobile_numbers" text[] NOT NULL,
	"latitude" real,
	"longitude" real,
	"address" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "providers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar(20) NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp NOT NULL,
	"payment_id" varchar(255),
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_user_role_idx" ON "profiles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
