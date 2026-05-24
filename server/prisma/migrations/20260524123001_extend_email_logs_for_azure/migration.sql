-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "cc" JSONB,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'Email',
ADD COLUMN     "error" TEXT,
ADD COLUMN     "event" TEXT,
ADD COLUMN     "message_id" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "participant_id" TEXT;
