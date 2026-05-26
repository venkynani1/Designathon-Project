-- Applies a versioned production database change for the execution platform.
-- Store coordinator feedback delivery history and uploaded response analysis.
ALTER TABLE "feedback_runs"
  ADD COLUMN "reminder_counts" JSONB,
  ADD COLUMN "delivery_summary" JSONB,
  ADD COLUMN "uploaded_file_type" TEXT,
  ADD COLUMN "extracted_text" TEXT,
  ADD COLUMN "ai_analysis" JSONB;

-- External feedback reports require Superset ID identity retention.
ALTER TABLE "feedback_responses"
  ADD COLUMN "superset_id" TEXT;
