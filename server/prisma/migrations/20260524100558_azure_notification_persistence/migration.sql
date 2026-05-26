-- Applies a versioned production database change for the execution platform.
-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "batch_code" TEXT NOT NULL,
    "training_name" TEXT NOT NULL,
    "training_type" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "schedule_type" TEXT,
    "custom_dates" TEXT,
    "timings" TEXT,
    "status" TEXT NOT NULL,
    "assessment_score_deadline" TIMESTAMP(3),
    "trainer_type" TEXT,
    "trainer_name" TEXT,
    "trainer_email" TEXT,
    "trainer_emp_id" TEXT,
    "trainer_unit_or_competency" TEXT,
    "trainer_phone" TEXT,
    "trainer_specialization" TEXT,
    "meeting_platform" TEXT,
    "batch_type" TEXT,
    "coordinator_spoc" TEXT,
    "meeting_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "participant_type" TEXT NOT NULL,
    "emp_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "superset_id" TEXT,
    "college_name" TEXT,
    "mobile_number" TEXT,
    "is_onboarded" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_status" TEXT NOT NULL DEFAULT 'Pending',
    "placement_officer_email" TEXT,
    "is_discontinued" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATE,
    "cutoff_score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "weightage" INTEGER NOT NULL,
    "uploaded_file_name" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "question_file_name" TEXT,
    "question_file_uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "emp_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "score_percent" INTEGER NOT NULL,
    "comments" TEXT,
    "cleared" BOOLEAN NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT,
    "batch_code" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT,
    "event" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recipient" TEXT,
    "recipients" JSONB,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_evidence" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT,
    "batch_code" TEXT,
    "type" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'Email',
    "recipients" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Mock Sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT,
    "batch_id" TEXT,
    "batch_code" TEXT,
    "to" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Mock Sent',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emp_id" TEXT,
    "unit_or_competency" TEXT,
    "phone" TEXT,
    "specialization" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_officer_mappings" (
    "id" TEXT NOT NULL,
    "college_name" TEXT NOT NULL,
    "placement_officer_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placement_officer_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_runs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3),
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "closure_deadline" TIMESTAMP(3),
    "uploaded_file_name" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_responses" (
    "id" TEXT NOT NULL,
    "feedback_run_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "emp_id" TEXT,
    "name" TEXT,
    "email" TEXT,
    "rating" DOUBLE PRECISION,
    "comments" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "training_name" TEXT,
    "minimum_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "uploaded_file_name" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "attendance_session_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "source_emp_id" TEXT,
    "source_name" TEXT,
    "source_email" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "first_join" TEXT,
    "last_leave" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "match_method" TEXT,
    "reason" TEXT,
    "raw_payload" JSONB,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_versions" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "raw_payload" JSONB,

    CONSTRAINT "attendance_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_summaries" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "attended" INTEGER NOT NULL DEFAULT 0,
    "not_attended" INTEGER NOT NULL DEFAULT 0,
    "high_risk" INTEGER NOT NULL DEFAULT 0,
    "medium_risk" INTEGER NOT NULL DEFAULT 0,
    "low_risk" INTEGER NOT NULL DEFAULT 0,
    "not_cleared" INTEGER NOT NULL DEFAULT 0,
    "pending_assessment" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "summary_text" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "insight_type" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'deterministic',
    "model" TEXT NOT NULL DEFAULT 'rule-based-v1',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_batch_code_key" ON "batches"("batch_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "participants_batch_id_idx" ON "participants"("batch_id");

-- CreateIndex
CREATE INDEX "participants_email_idx" ON "participants"("email");

-- CreateIndex
CREATE INDEX "participants_emp_id_idx" ON "participants"("emp_id");

-- CreateIndex
CREATE INDEX "assessments_batch_id_idx" ON "assessments"("batch_id");

-- CreateIndex
CREATE INDEX "assessment_results_assessment_id_idx" ON "assessment_results"("assessment_id");

-- CreateIndex
CREATE INDEX "assessment_results_participant_id_idx" ON "assessment_results"("participant_id");

-- CreateIndex
CREATE INDEX "logs_batch_id_idx" ON "logs"("batch_id");

-- CreateIndex
CREATE INDEX "logs_batch_code_idx" ON "logs"("batch_code");

-- CreateIndex
CREATE INDEX "logs_created_at_idx" ON "logs"("created_at");

-- CreateIndex
CREATE INDEX "assessment_evidence_assessment_id_idx" ON "assessment_evidence"("assessment_id");

-- CreateIndex
CREATE INDEX "notifications_batch_id_idx" ON "notifications"("batch_id");

-- CreateIndex
CREATE INDEX "notifications_batch_code_idx" ON "notifications"("batch_code");

-- CreateIndex
CREATE INDEX "notifications_event_idx" ON "notifications"("event");

-- CreateIndex
CREATE INDEX "email_logs_notification_id_idx" ON "email_logs"("notification_id");

-- CreateIndex
CREATE INDEX "email_logs_batch_code_idx" ON "email_logs"("batch_code");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_email_key" ON "trainer_profiles"("email");

-- CreateIndex
CREATE INDEX "trainer_profiles_status_idx" ON "trainer_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "placement_officer_mappings_college_name_key" ON "placement_officer_mappings"("college_name");

-- CreateIndex
CREATE INDEX "feedback_runs_batch_id_idx" ON "feedback_runs"("batch_id");

-- CreateIndex
CREATE INDEX "feedback_responses_feedback_run_id_idx" ON "feedback_responses"("feedback_run_id");

-- CreateIndex
CREATE INDEX "feedback_responses_participant_id_idx" ON "feedback_responses"("participant_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_batch_id_idx" ON "attendance_sessions"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_batch_id_source_session_date_key" ON "attendance_sessions"("batch_id", "source", "session_date");

-- CreateIndex
CREATE INDEX "attendance_records_attendance_session_id_idx" ON "attendance_records"("attendance_session_id");

-- CreateIndex
CREATE INDEX "attendance_records_participant_id_idx" ON "attendance_records"("participant_id");

-- CreateIndex
CREATE INDEX "attendance_versions_batch_id_idx" ON "attendance_versions"("batch_id");

-- CreateIndex
CREATE INDEX "attendance_versions_source_idx" ON "attendance_versions"("source");

-- CreateIndex
CREATE INDEX "attendance_summaries_batch_id_idx" ON "attendance_summaries"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_summaries_batch_id_source_key" ON "attendance_summaries"("batch_id", "source");

-- CreateIndex
CREATE INDEX "ai_insights_batch_id_idx" ON "ai_insights"("batch_id");

-- CreateIndex
CREATE INDEX "ai_insights_input_hash_idx" ON "ai_insights"("input_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insights_batch_id_insight_type_input_hash_key" ON "ai_insights"("batch_id", "insight_type", "input_hash");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_runs" ADD CONSTRAINT "feedback_runs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_feedback_run_id_fkey" FOREIGN KEY ("feedback_run_id") REFERENCES "feedback_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_versions" ADD CONSTRAINT "attendance_versions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_summaries" ADD CONSTRAINT "attendance_summaries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
