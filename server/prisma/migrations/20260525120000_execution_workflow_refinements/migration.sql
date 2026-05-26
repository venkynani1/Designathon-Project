-- Applies a versioned production database change for the execution platform.
ALTER TABLE "batches" ADD COLUMN "assigned_trainers" JSONB;

ALTER TABLE "feedback_runs"
ADD COLUMN "closed_at" TIMESTAMP(3),
ADD COLUMN "feedback_link" TEXT,
ADD COLUMN "eligible_participant_ids" JSONB;

ALTER TABLE "feedback_responses"
ADD COLUMN "top_takeaways" TEXT,
ADD COLUMN "superset_id" TEXT,
ADD COLUMN "improvements" TEXT,
ADD COLUMN "course_impact" TEXT,
ADD COLUMN "assignment_usefulness" TEXT,
ADD COLUMN "demonstration_usefulness" TEXT,
ADD COLUMN "trainer_support_feedback" TEXT,
ADD COLUMN "technical_discussion_usefulness" TEXT;
