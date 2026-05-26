-- Applies a versioned production database change for the execution platform.
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "event_date" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "participant_id" TEXT;

-- CreateIndex
CREATE INDEX "notifications_participant_id_idx" ON "notifications"("participant_id");

-- CreateIndex
CREATE INDEX "notifications_event_date_idx" ON "notifications"("event_date");
