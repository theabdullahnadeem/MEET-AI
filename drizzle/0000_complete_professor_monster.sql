-- Add 'failed' value to the existing meeting_status enum
ALTER TYPE "public"."meeting_status" ADD VALUE IF NOT EXISTS 'failed';--> statement-breakpoint

-- Add low_confidence column to meetings table
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "low_confidence" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Create speaker_mappings table for debug logging and manual speaker name corrections
CREATE TABLE IF NOT EXISTS "speaker_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"speaker_id" text NOT NULL,
	"original_label" text NOT NULL,
	"custom_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Foreign key: speaker_mappings.meeting_id -> meetings.id
ALTER TABLE "speaker_mappings" ADD CONSTRAINT "speaker_mappings_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Composite index for fast lookups by meeting + speaker
CREATE INDEX IF NOT EXISTS "speaker_mappings_meeting_speaker_idx" ON "speaker_mappings" USING btree ("meeting_id","speaker_id");