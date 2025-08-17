ALTER TABLE "tasks" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" varchar;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_time" varchar(5);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "task_scope" varchar DEFAULT 'project';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "google_drive_link" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "google_calendar_event_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_token_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_sync_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;