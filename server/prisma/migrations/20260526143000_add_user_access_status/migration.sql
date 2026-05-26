-- Applies a versioned production database change for the execution platform.
ALTER TABLE "users"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Active';
