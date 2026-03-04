ALTER TABLE "users_table" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;
ALTER TABLE "users_table" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "users_table" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;