-- Applies a versioned production database change for the execution platform.
/*
  Warnings:

  - You are about to drop the column `superset_id` on the `feedback_responses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessment_results" ADD COLUMN     "superset_id" TEXT;

-- AlterTable
ALTER TABLE "feedback_responses" DROP COLUMN "superset_id";
