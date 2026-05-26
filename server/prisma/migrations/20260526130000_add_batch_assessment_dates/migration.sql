-- Applies a versioned production database change for the execution platform.
ALTER TABLE "batches" ADD COLUMN "assessment_dates" TEXT;
