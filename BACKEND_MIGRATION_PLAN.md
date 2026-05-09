   # Backend Migration Plan

## Current State

Mavericks Execution Platform is currently a frontend-only React/Vite application. The UI, routing, business rules, CSV parsing, report generation, mock data, and persistence all run in the browser.

Current architecture:

```text
React UI -> frontend utility engines -> localStorage / browser downloads
```

Target architecture:

```text
React UI -> API client -> backend API -> database
                         -> optional AI insight provider
```

The migration should preserve the existing UI and move persistence behind an API one domain at a time.

## 1. Backend Tech Stack Recommendation

### Recommended Stack

- **Backend runtime:** Node.js with Express
- **Database:** PostgreSQL
- **ORM/query layer:** Prisma
- **Validation:** Zod
- **Authentication later:** JWT/session auth, or hosted auth provider after core persistence works
- **Deployment target:** Azure App Service, Azure Container Apps, Azure Functions, or another Node-compatible host
- **Frontend integration:** Vite environment variable such as `VITE_API_BASE_URL`

### Why This Stack Fits

- The project is already JavaScript/React, so Node keeps one language across frontend and backend.
- Prisma gives typed schema management and migrations without requiring a large framework.
- PostgreSQL fits the relational shape of batches, participants, attendance sessions, assessment results, feedback, logs, and notifications.
- Express is simple enough for a staged migration and will not force a large rewrite.
- The current frontend utilities can be reused or mirrored gradually.

### Acceptable Alternative

If Azure SQL is mandatory for the final demo, use:

- Node.js with Express
- Azure SQL Database
- Prisma or direct SQL via `mssql`

PostgreSQL is simpler for local development. Azure SQL may be better if the project must align tightly with Microsoft/Azure judging criteria.

## 2. Database Tables and Entities Needed

### Core Entities

#### `users`

Future authentication and RBAC.

Suggested fields:

- `id`
- `name`
- `email`
- `role`
- `created_at`
- `updated_at`

Initial migration can skip real auth and keep simulated roles in the frontend.

#### `batches`

Replaces the top-level batch objects currently stored in `mavericks_phase2_batches`.

Suggested fields:

- `id`
- `batch_code`
- `training_name`
- `training_type`
- `start_date`
- `end_date`
- `timings`
- `status`
- `trainer_name`
- `trainer_email`
- `trainer_phone`
- `trainer_specialization`
- `coordinator_spoc`
- `meeting_link`
- `created_at`
- `updated_at`

#### `participants`

Replaces `batch.participants`.

Suggested fields:

- `id`
- `batch_id`
- `participant_type`
- `emp_id`
- `name`
- `email`
- `mobile_number`
- `is_discontinued`
- `created_at`
- `updated_at`

For internal candidates, use `emp_id`, `name`, and `email`.
For external/Segue candidates, use `name`, `email`, and `mobile_number`.

#### `batch_timeline_events`

Stores lifecycle progress currently nested in `batch.timeline`.

Suggested fields:

- `id`
- `batch_id`
- `step`
- `state`
- `detail`
- `updated_at`

This can also be computed at first, then persisted later.

### Attendance Entities

#### `attendance_sessions`

Represents one uploaded attendance file/session/day.

Suggested fields:

- `id`
- `batch_id`
- `source`
- `session_date`
- `training_name`
- `minimum_duration_minutes`
- `uploaded_file_name`
- `uploaded_at`
- `created_by`

#### `attendance_records`

Normalized attendee rows from Teams/Webex.

Suggested fields:

- `id`
- `attendance_session_id`
- `participant_id`
- `source_emp_id`
- `source_name`
- `source_email`
- `duration_minutes`
- `first_join`
- `last_leave`
- `matched`
- `match_method`
- `reason`
- `raw_payload`

Unmatched records should be stored with `participant_id = null`, `matched = false`, and a reason.

#### `attendance_summaries`

Cached report-level summary for fast UI reads.

Suggested fields:

- `id`
- `batch_id`
- `source`
- `total_participants`
- `attended`
- `not_attended`
- `high_risk`
- `medium_risk`
- `low_risk`
- `not_cleared`
- `pending_assessment`
- `unmatched`
- `summary_text`
- `generated_at`

The backend can recompute this whenever attendance, assessments, or feedback changes.

### Assessment Entities

#### `assessments`

Replaces `batch.assessments`.

Suggested fields:

- `id`
- `batch_id`
- `name`
- `type`
- `date`
- `cutoff_score`
- `max_score`
- `weightage`
- `uploaded_file_name`
- `uploaded_at`
- `created_at`
- `updated_at`

#### `assessment_results`

Replaces `assessment.results`.

Suggested fields:

- `id`
- `assessment_id`
- `participant_id`
- `emp_id`
- `name`
- `email`
- `score_percent`
- `comments`
- `cleared`
- `uploaded_at`

### Feedback Entities

#### `feedback_runs`

Represents a feedback trigger/report for a batch.

Suggested fields:

- `id`
- `batch_id`
- `triggered_at`
- `uploaded_file_name`
- `uploaded_at`
- `summary`
- `created_at`
- `updated_at`

#### `feedback_responses`

Replaces `batch.feedback.responses`.

Suggested fields:

- `id`
- `feedback_run_id`
- `participant_id`
- `emp_id`
- `name`
- `email`
- `rating`
- `comments`
- `matched`
- `uploaded_at`

### Notification and Audit Entities

#### `logs`

Replaces `mavericks_execution_logs`.

Suggested fields:

- `id`
- `batch_id`
- `action`
- `category`
- `level`
- `message`
- `recipient`
- `status`
- `type`
- `created_at`

This can support both notifications and audit logs initially.

### Optional AI Entity

#### `ai_insights`

Stores cached AI-generated summaries later.

Suggested fields:

- `id`
- `batch_id`
- `insight_type`
- `input_hash`
- `summary`
- `provider`
- `model`
- `generated_at`

Do not add live AI calls until durable persistence exists.

## 3. API Endpoints Needed

Use `/api` as the base path.

### Batch Endpoints

- `GET /api/batches`
- `GET /api/batches/:batchId`
- `POST /api/batches`
- `PUT /api/batches/:batchId`
- `PATCH /api/batches/:batchId/status`
- `DELETE /api/batches/:batchId`

The frontend currently uses `batch.batchId` as the route identifier. The API can expose `batch_code` as `batchId` in JSON to avoid UI churn.

### Participant Endpoints

- `GET /api/batches/:batchId/participants`
- `POST /api/batches/:batchId/participants`
- `PUT /api/batches/:batchId/participants/:participantId`
- `DELETE /api/batches/:batchId/participants/:participantId`
- `PATCH /api/batches/:batchId/participants/:participantId/discontinue`

### Attendance Endpoints

Recommended first version keeps CSV parsing in the browser and posts canonical JSON.

- `GET /api/batches/:batchId/attendance`
- `POST /api/batches/:batchId/attendance/sessions`
- `GET /api/batches/:batchId/attendance/report`
- `GET /api/batches/:batchId/attendance/unmatched`
- `DELETE /api/batches/:batchId/attendance/sessions/:sessionId`

Request body for `POST /attendance/sessions` should include:

- `source`
- `minimumDurationMinutes`
- `sessions`
- `uploadedFileNames`

The backend should validate duplicate dates and recompute summaries.

### Assessment Endpoints

- `GET /api/batches/:batchId/assessments`
- `POST /api/batches/:batchId/assessments`
- `PUT /api/batches/:batchId/assessments/:assessmentId`
- `POST /api/batches/:batchId/assessments/:assessmentId/results`
- `GET /api/batches/:batchId/assessments/stats`
- `GET /api/batches/:batchId/assessments/toppers`

The frontend can still generate and parse CSV templates, then post validated score rows.

### Feedback Endpoints

- `GET /api/batches/:batchId/feedback`
- `POST /api/batches/:batchId/feedback/trigger`
- `POST /api/batches/:batchId/feedback/responses`
- `GET /api/batches/:batchId/feedback/summary`

### Log and Notification Endpoints

- `GET /api/logs`
- `GET /api/batches/:batchId/logs`
- `POST /api/logs`
- `PATCH /api/logs/:logId/status`

### Report Endpoints

Keep Excel generation in the frontend at first. The API should return report data.

- `GET /api/batches/:batchId/reports/consolidated-data`
- `GET /api/batches/:batchId/reports/assessment-data`
- `GET /api/batches/:batchId/reports/topper-data`

### Future AI Endpoint

- `POST /api/batches/:batchId/insights/generate`
- `GET /api/batches/:batchId/insights`

This should be cached and rate-limited.

## 4. localStorage Keys to Replace First

### Replace First

#### `mavericks_phase2_batches`

Current owner:

- `src/App.jsx`

Contains:

- Batch registry
- Trainer details
- Participants
- Assessments
- Feedback
- Health snapshots
- Timeline
- Discontinued participant IDs

Why first:

- It is the main source of truth.
- Every feature depends on batches and participants.
- Moving it creates the API foundation for later modules.

### Replace Second

#### `mavericks_execution_logs`

Current owner:

- `src/App.jsx`
- `src/utils/notificationEngine.js`
- `src/components/LogsPanel.jsx`

Why second:

- Logs should be shared across users.
- It is relatively simple to persist.
- It gives immediate backend value without touching parser logic.

### Replace Third

#### `mavericks_teams_attendance_<batchId>`
#### `mavericks_webex_attendance_<batchId>`

Current owner:

- `src/components/uploads/TeamsAttendanceUpload.jsx`

Why third:

- Attendance is important but more complex.
- Browser parsing can remain while persistence moves server-side.
- Backend summaries should eventually replace frontend-only report state.

### Keep Local Longer

No current localStorage keys are only UI preferences. If UI preferences are added later, those can remain local.

## 5. Exact Implementation Order

### Phase 0: Preparation

1. Add `BACKEND_MIGRATION_PLAN.md`.
2. Update `README.md` later with the new architecture once code exists.
3. Do not modify frontend behavior yet.

### Phase 1: Backend Skeleton

1. Add backend folder, for example `server/`.
2. Add Express app with health endpoint:
   - `GET /api/health`
3. Add environment config:
   - `DATABASE_URL`
   - `PORT`
   - `CORS_ORIGIN`
4. Add Prisma schema and initial migration.
5. Add seed script using data from `src/data/mockData.js`.

Goal:

```text
Frontend still uses localStorage.
Backend can run independently and return health.
```

### Phase 2: Batches and Participants API

1. Create `batches` and `participants` tables.
2. Seed mock batches and participants.
3. Implement batch and participant endpoints.
4. Add frontend API client, for example:
   - `src/utils/apiClient.js`
   - `src/services/batchService.js`
5. Update `App.jsx` to load batches from API.
6. Keep localStorage fallback if API is unavailable.
7. Update create/edit batch and add/delete participant callbacks to call API.

Goal:

```text
Batch registry and participant management are backend-backed.
UI remains visually unchanged.
```

### Phase 3: Logs and Notifications API

1. Create `logs` table.
2. Seed `mockLogs`.
3. Implement log endpoints.
4. Replace `mavericks_execution_logs` reads/writes in `App.jsx`.
5. Keep `notificationEngine.js` as a log object factory, but send created logs to API.

Goal:

```text
Notification Center and Audit Trail persist across browsers.
```

### Phase 4: Assessments API

1. Create `assessments` and `assessment_results` tables.
2. Implement assessment setup and results endpoints.
3. Keep `downloadAssessmentTemplate()` in the frontend.
4. Keep CSV parsing in `assessmentEngine.js` initially.
5. After parsing, post normalized results to API.
6. Update `AssessmentModule.jsx` to read/write assessments through API or through refreshed batch details.

Goal:

```text
Assessment setup, uploaded scores, clearance stats, and toppers are backend-backed.
```

### Phase 5: Feedback API

1. Create `feedback_runs` and `feedback_responses` tables.
2. Implement trigger and response upload endpoints.
3. Keep CSV parsing in `feedbackEngine.js` initially.
4. Persist generated summary on the backend.
5. Update `FeedbackModule.jsx` to read/write through API.

Goal:

```text
Feedback trigger state, uploaded responses, and summaries persist centrally.
```

### Phase 6: Attendance API

1. Create `attendance_sessions`, `attendance_records`, and `attendance_summaries`.
2. Keep Teams/Webex parsing in:
   - `src/utils/teamsParser.js`
   - `src/utils/webexParser.js`
   - `src/utils/attendanceEngine.js`
3. Post parsed canonical sessions to API from `TeamsAttendanceUpload.jsx`.
4. Backend validates:
   - Batch exists
   - Duplicate session date
   - Participant matching
   - Minimum duration
5. Backend stores records and recomputes summary.
6. Frontend reads report from:
   - `GET /api/batches/:batchId/attendance/report`
7. Keep frontend report generation and Excel export.

Goal:

```text
Attendance sessions, unmatched records, risk summary, and report rows are backend-backed.
```

### Phase 7: Report Data API

1. Keep ExcelJS export in the browser.
2. Add API endpoints that return report-ready JSON.
3. Update `ReportsModule.jsx` and attendance export flow to use API data.

Goal:

```text
Exports use canonical backend data but still download client-side.
```

### Phase 8: Real AI Insights

1. Add `ai_insights` table.
2. Add backend summary generation endpoint.
3. Use current rule-based summaries as fallback.
4. Cache summaries by input hash.
5. Replace frontend-only "AI Summary" generation with API-provided summaries.

Goal:

```text
"AI Summary" becomes real while remaining cost-controlled and resilient.
```

### Phase 9: Authentication and RBAC

1. Add real users.
2. Replace hardcoded role selector behavior with authenticated role claims.
3. Enforce permissions in backend middleware.
4. Keep frontend role-specific views, but stop trusting the client for access control.

Goal:

```text
Admin, Coordinator, Trainer, and Participant access becomes enforceable.
```

## 6. Risks and Files Likely to Be Modified

### Main Risks

#### UI regression during data-shape migration

Current components expect nested batch objects:

- `batch.trainer`
- `batch.participants`
- `batch.assessments`
- `batch.feedback`
- `batch.timeline`
- `batch.healthSnapshot`

The API should return a compatibility shape first to avoid large UI rewrites.

#### ID confusion

The UI uses:

- `batch.batchId`
- `participant.id`
- assessment IDs like `ASM-*`

The database will likely use internal UUIDs or numeric IDs. Return both internal IDs and display codes where needed.

#### LocalStorage/API race conditions

During transition, avoid writing to both API and localStorage as equal sources of truth. Prefer:

1. Try API.
2. If API fails, use localStorage fallback in demo mode.
3. Clearly mark fallback state in development logs.

#### CSV validation mismatch

Frontend parsers currently validate and normalize files. Backend must revalidate posted records before saving, otherwise bad data can bypass the UI later.

#### Attendance report parity

`prepareAttendanceReport()` currently combines attendance, assessment, and feedback signals. Moving only part of that logic to the backend can create mismatched UI summaries.

Recommendation:

- Keep frontend report generation until all source data is backend-backed.
- Then move canonical summary calculation backend-side.

#### ExcelJS bundle size

Build currently creates a large ExcelJS chunk. This is acceptable for demo export, but later report routes should lazy-load export code only when needed.

#### Role security

Current RBAC is presentation-only. Do not treat role-based frontend filtering as security after backend APIs exist.

### Files Likely to Be Modified

#### Frontend app shell

- `src/App.jsx`

Expected changes:

- Replace `loadFromStorage(BATCH_STORAGE_KEY, mockBatches)`.
- Replace `loadFromStorage(LOG_STORAGE_KEY, mockLogs)`.
- Add async data loading states.
- Call API-backed create/update/delete functions.

#### Batch UI

- `src/components/BatchManagement.jsx`

Expected changes:

- Keep most rendering.
- Adjust callbacks to await API results if needed.
- Potentially add loading/error messages.

#### Attendance UI

- `src/components/uploads/TeamsAttendanceUpload.jsx`

Expected changes:

- Replace per-batch attendance localStorage keys.
- Post parsed sessions to API.
- Fetch report data from backend.
- Keep upload UI and export button.

#### Assessment UI and logic

- `src/components/AssessmentModule.jsx`
- `src/utils/assessmentEngine.js`

Expected changes:

- Keep template download and parser.
- Post assessment setup/results to backend.
- Fetch stats/toppers from backend after persistence exists.

#### Feedback UI and logic

- `src/components/FeedbackModule.jsx`
- `src/utils/feedbackEngine.js`

Expected changes:

- Keep parser.
- Persist trigger state and responses through API.
- Fetch stored summary.

#### Reports

- `src/components/ReportsModule.jsx`
- `src/utils/attendanceExport.js`

Expected changes:

- Continue Excel generation in browser.
- Accept report data from API instead of nested local state.

#### Logs and notifications

- `src/components/LogsPanel.jsx`
- `src/utils/notificationEngine.js`

Expected changes:

- Keep display and log object creation helpers.
- Persist created logs through API.

#### Storage utilities

- `src/utils/storage.js`

Expected changes:

- Keep only for temporary fallback or UI preferences.
- Stop using for enterprise data once each domain migrates.

#### Mock data

- `src/data/mockData.js`

Expected changes:

- Keep for seed scripts and frontend fallback during migration.
- Eventually move demo seed data into backend seed files.

#### New likely frontend files

- `src/utils/apiClient.js`
- `src/services/batchService.js`
- `src/services/logService.js`
- `src/services/attendanceService.js`
- `src/services/assessmentService.js`
- `src/services/feedbackService.js`

#### New likely backend files

- `server/package.json`
- `server/src/app.js`
- `server/src/server.js`
- `server/src/routes/*.js`
- `server/src/services/*.js`
- `server/src/validators/*.js`
- `server/prisma/schema.prisma`
- `server/prisma/seed.js`

## Recommended First Pull Request

The safest first implementation PR should include only:

1. Backend skeleton.
2. Database schema for `batches`, `participants`, and `logs`.
3. Seed script using the current mock data.
4. Batch and participant read endpoints.
5. No frontend persistence changes yet.

That gives the project a backend foundation without risking the existing demo UI.

## Decision Summary

Build persistence in this order:

1. Batches and participants
2. Logs and notifications
3. Assessments
4. Feedback
5. Attendance sessions and summaries
6. Report data endpoints
7. AI insights
8. Authentication and RBAC

Keep browser CSV parsing and Excel export during the first backend migration. Move canonical persistence and validation to the backend before adding real AI or authentication.
