# Mavericks Execution Platform

Mavericks Execution Platform is a React + Vite training execution demo with a staged Node.js backend migration. The frontend preserves the original localStorage demo behavior while backend persistence is enabled module by module.

Current architecture:

```text
React/Vite UI -> frontend services -> Express API -> Prisma -> PostgreSQL
        fallback -> localStorage / browser-generated Excel
```

## Fresh Clone Setup

Prerequisites:

- Node.js 20+
- PostgreSQL
- npm

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd server
npm install
cd ..
```

Create environment files:

```bash
copy .env.example .env
copy server\.env.example server\.env
```

Set backend variables in `server/.env`:

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mavericks_execution_platform?schema=public"
JWT_SECRET="replace-with-a-long-random-demo-secret"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
```

Set frontend API URL in `.env` if needed:

```text
VITE_API_BASE_URL="http://localhost:4000/api"
```

Generate Prisma client, run migrations, and seed demo data:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
cd ..
```

Run the backend:

```bash
cd server
npm run dev
```

Run the frontend in a second terminal:

```bash
npm run dev
```

Frontend defaults to `http://localhost:5173`. Backend defaults to `http://localhost:4000/api`.

## Test Commands

Frontend build, lint, and utility tests:

```bash
npm run build
npm run lint
npm run test
```

Backend API tests and Prisma validation:

```bash
cd server
npm run test
npx prisma validate
```

## Migration Order

Completed backend migration phases:

1. Backend skeleton with Express, Prisma, health endpoint, and seed setup.
2. Batches and participants API with frontend API/localStorage fallback.
3. Logs and notifications backend persistence.
4. Assessments backend persistence and stats/toppers APIs.
5. Feedback trigger, response upload, and summary persistence.
6. Attendance session, record, unmatched, and summary persistence.
7. Report-ready JSON APIs while keeping ExcelJS generation in the browser.
8. Deterministic backend AI insight foundation with input-hash caching.
9. Demo JWT authentication and backend-enforced write RBAC.
10. Automated frontend utility tests and backend API tests.
11. Production-readiness cleanup: Prisma config, env validation, error format, dev request logging, and documentation.

## Demo Roles

Seeded demo users:

- Admin: `admin@mavericks.demo`
- Coordinator: `coordinator@mavericks.demo`
- Trainer: `trainer@mavericks.demo`
- Participant: `participant@mavericks.demo`

The UI still uses the role selector. When a role is selected, the frontend calls `POST /api/auth/demo-login`, stores the returned JWT in localStorage, and attaches it as `Authorization: Bearer <token>` for API requests.

Backend write permissions:

- Admin and Coordinator: batch, participant, log, assessment, feedback, attendance, and insight writes.
- Trainer: log, assessment, attendance, and insight writes.
- Participant: read-only in this foundation phase.

Read endpoints are public for demo continuity.

## Fallback Behavior

The frontend keeps the original localStorage fallback. If the backend or auth path is unavailable:

- batch and participant flows fall back to `mavericks_phase2_batches`
- logs fall back to `mavericks_execution_logs`
- Teams/Webex attendance falls back to `mavericks_teams_attendance_<batchId>` or `mavericks_webex_attendance_<batchId>`
- assessment and feedback modules keep using current batch state
- report exports fall back to current frontend report data
- deterministic insight text falls back to the existing frontend rule-based summary

This allows demos to continue even when PostgreSQL or the API is offline.

## Backend Endpoints

Auth and health:

- `GET /api/health`
- `POST /api/auth/demo-login`
- `GET /api/auth/me`

Batches and participants:

- `GET /api/batches`
- `GET /api/batches/:batchId`
- `POST /api/batches`
- `PUT /api/batches/:batchId`
- `PATCH /api/batches/:batchId/status`
- `DELETE /api/batches/:batchId`
- `GET /api/batches/:batchId/participants`
- `POST /api/batches/:batchId/participants`
- `PUT /api/batches/:batchId/participants/:participantId`
- `DELETE /api/batches/:batchId/participants/:participantId`
- `PATCH /api/batches/:batchId/participants/:participantId/discontinue`

Execution modules:

- `GET /api/logs`
- `POST /api/logs`
- `PATCH /api/logs/:logId/status`
- `GET /api/batches/:batchId/logs`
- `GET /api/batches/:batchId/assessments`
- `POST /api/batches/:batchId/assessments`
- `PUT /api/batches/:batchId/assessments/:assessmentId`
- `DELETE /api/batches/:batchId/assessments/:assessmentId`
- `POST /api/batches/:batchId/assessments/:assessmentId/results`
- `GET /api/batches/:batchId/assessments/stats`
- `GET /api/batches/:batchId/assessments/toppers`
- `GET /api/batches/:batchId/feedback`
- `POST /api/batches/:batchId/feedback/trigger`
- `POST /api/batches/:batchId/feedback/responses`
- `GET /api/batches/:batchId/feedback/summary`
- `GET /api/batches/:batchId/attendance`
- `POST /api/batches/:batchId/attendance/sessions`
- `GET /api/batches/:batchId/attendance/report`
- `GET /api/batches/:batchId/attendance/unmatched`
- `DELETE /api/batches/:batchId/attendance/sessions/:sessionId`

Reports and insights:

- `GET /api/batches/:batchId/reports/consolidated-data`
- `GET /api/batches/:batchId/reports/assessment-data`
- `GET /api/batches/:batchId/reports/topper-data`
- `GET /api/batches/:batchId/reports/attendance-data`
- `GET /api/batches/:batchId/insights`
- `POST /api/batches/:batchId/insights/generate`

## Production Notes

- Prisma CLI config now lives in `server/prisma.config.js` instead of deprecated `package.json#prisma`.
- Backend startup validates `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `CORS_ORIGIN`.
- Backend errors are normalized as:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Human-readable message"
  }
}
```

- Development mode logs request method, URL, status, and duration.
- Excel generation remains frontend-only for now.
