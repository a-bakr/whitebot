ALTER TABLE "users_table" DROP CONSTRAINT "users_table_api_user_id_unique";--> statement-breakpoint
ALTER TABLE "users_table" DROP COLUMN IF EXISTS "api_user_id";