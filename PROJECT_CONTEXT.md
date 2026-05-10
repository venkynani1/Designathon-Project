# Project Context

## Architecture

Mavericks Execution Platform is a training execution management demo. It began as a frontend-only React/Vite application using localStorage, and has been migrated into a staged full-stack architecture:

```text
React/Vite frontend
  -> service layer with API-first calls
  -> Express backend
  -> Prisma ORM
  -> PostgreSQL
```

The frontend still preserves localStorage fallback so the demo remains usable when the backend is unavailable.

## Main Modules

- Role workspaces: Admin, Coordinator, Trainer, and Participant views.
- Batch management: batch registry, trainer details, coordinator SPOC, status, and meeting link.
- Participant management: internal and external/Segue participant rosters.
- Coordinator batch operations: Excel batch template download/upload, preview validation, participant template download/upload, and close batch action.
- Coordinator lifecycle: six-step timeline for batch created, attendance upload, assessment scores, feedback, topper/report export, and batch close readiness.
- Logs and notifications: audit trail and notification center records.
- Assessments: setup, CSV score upload, clearance stats, and topper calculation.
- Feedback: trigger state, CSV response upload, response matching, and summary.
- Attendance: Teams/Webex CSV parsing, sessions, records, unmatched records, risk summary, and report rows.
- Reports: backend report-ready JSON with browser-side Excel export.
- Insights: deterministic rule-based summary generation cached by input hash.
- Auth/RBAC: demo JWT login and backend-enforced write permissions.

## Completed Phases

1. Express backend skeleton, Prisma setup, health endpoint, and seed foundation.
2. Batches and participants connected to backend with local fallback.
3. Logs and notifications migrated to backend persistence.
4. Assessments migrated to backend persistence.
5. Feedback migrated to backend persistence.
6. Attendance sessions, records, summaries, and unmatched records migrated.
7. Report data endpoints added while ExcelJS export remains frontend-only.
8. Deterministic backend insights added with cached summaries.
9. Demo JWT authentication and RBAC write protection added.
10. Automated utility and API tests added.
11. Production-readiness cleanup added: Prisma config file, env validation, normalized error responses, dev request logging, README, and project context.

## Backend Persistence

Current Prisma-backed tables:

- `users`
- `batches`
- `participants`
- `logs`
- `assessments`
- `assessment_results`
- `feedback_runs`
- `feedback_responses`
- `attendance_sessions`
- `attendance_records`
- `attendance_summaries`
- `ai_insights`

Recent batch and participant fields include:

- batches: `scheduleType`, `customDates`, `assessmentScoreDeadline`, `trainerType`, `trainerEmpId`, `trainerUnitOrCompetency`, `meetingPlatform`, `batchType`
- participants: `supersetId`, `collegeName`

Coordinator lifecycle endpoints:

- `GET /api/batches/:batchId/lifecycle`
- `PATCH /api/batches/:batchId/assessment-deadline`
- `POST /api/batches/:batchId/reminders/attendance`
- `POST /api/batches/:batchId/reminders/assessment`
- `PATCH /api/batches/:batchId/close`

Reminder behavior is simulated with log/notification records only. No SMTP/email provider is integrated.

## Frontend/Backend Connection

Frontend services in `src/services/` call the Express API through `src/utils/apiClient.js`.

`apiClient.js` reads `VITE_API_BASE_URL` and attaches a demo JWT from localStorage when available. Each migrated module tries the backend first and falls back to localStorage or current batch state on failure.

## RBAC Model

Seeded demo roles:

- Admin
- Coordinator
- Trainer
- Participant

Write permissions:

- Admin and Coordinator: broad execution writes.
- Trainer: training delivery writes for logs, assessments, attendance, and insights.
- Participant: read-only.

Reads remain public for demo continuity.

## Testing

Frontend utility tests cover:

- Teams parser
- Webex parser
- Attendance report/risk engine
- Assessment stats/topper helpers
- Feedback summary helper
- Coordinator batch and participant Excel template validation/parsing
- Coordinator six-step lifecycle calculation, attendance 15-minute rule, assessment deadline status, close readiness, and reminder log text

Backend tests cover:

- health
- demo login
- auth me
- protected route `401`
- insufficient role `403`
- batch reads
- assessment stats/toppers
- feedback summary
- attendance report
- insight caching
- batch and participant field mapping for coordinator template uploads
- lifecycle response, reminder log creation, assessment deadline update, and close-batch RBAC

Useful validation commands:

```bash
npm run build
npm run lint
npm run test
cd server
npm run test
npx prisma validate
```

## Pending Future Work

- Replace demo JWT login with real identity provider integration.
- Add user assignment rules for trainers and participants instead of broad role-only checks.
- Add database-backed UI loading/error states per module.
- Add migration files for each schema phase if this becomes a long-lived production repository.
- Move CSV parsing server-side for stricter validation and auditability.
- Add real AI provider integration behind the deterministic insight fallback.
- Add CI workflow for build, lint, tests, and Prisma validation.
- Add deployment manifests for Azure App Service, Azure Container Apps, or another target.
- Add observability: structured logs, request IDs, metrics, and error reporting.

## Evaluation Talking Points

- The project demonstrates a safe incremental migration from frontend-only localStorage to durable backend persistence.
- The UI remained stable while persistence moved module by module.
- The fallback design keeps demos resilient when backend infrastructure is unavailable.
- Backend write protection is enforced by JWT roles while read endpoints stay demo-friendly.
- Attendance, assessment, feedback, and reports now use canonical backend data.
- Deterministic insights provide a cost-free AI foundation and a clean future integration point for a real provider.
- Automated tests cover core parsing/business logic and critical API behavior.
- Coordinator batch uploads remain browser-parsed with backend persistence and localStorage fallback.
- Batch close readiness is enforced by lifecycle rules while preserving local fallback when the backend is unavailable.
