# Mavericks Execution Platform

Mavericks Execution Platform is a React + Vite training execution demo with a staged backend migration in progress.

The current frontend still uses browser `localStorage` for persistence. The new `/server` package adds the first backend foundation with read-only APIs for batches, participants, logs, and health checks.

Batch, participant, log, notification, assessment, feedback, attendance, report data, and deterministic insight flows now try the backend first when it is available. If the backend cannot be reached, the frontend keeps using the existing `localStorage` data so the demo remains usable.

## Frontend Setup

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Optional frontend environment file:

```bash
copy .env.example .env
```

Set `VITE_API_BASE_URL` if the backend is not running at `http://localhost:4000/api`.

Build and lint:

```bash
npm run build
npm run lint
```

## Backend Setup

The backend lives in `server/` and uses Node.js, Express, Prisma, and PostgreSQL.

Install backend dependencies:

```bash
cd server
npm install
```

Create an environment file:

```bash
copy .env.example .env
```

Update `DATABASE_URL` in `server/.env` for your local PostgreSQL database.

Generate the Prisma client:

```bash
npm run prisma:generate
```

Create database tables:

```bash
npm run prisma:migrate -- --name init
```

Seed demo data from `src/data/mockData.js`:

```bash
npm run prisma:seed
```

Run the backend:

```bash
npm run dev
```

The API defaults to:

```text
http://localhost:4000/api
```

## Backend Endpoints

Batch, participant, log, notification, assessment, feedback, and attendance endpoints currently implemented:

- `GET /api/health`
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
- `GET /api/batches/:batchId/reports/consolidated-data`
- `GET /api/batches/:batchId/reports/assessment-data`
- `GET /api/batches/:batchId/reports/topper-data`
- `GET /api/batches/:batchId/reports/attendance-data`
- `GET /api/batches/:batchId/insights`
- `POST /api/batches/:batchId/insights/generate`

## Migration Status

The frontend is connected to the backend for batches, participants, logs, notifications, assessments, feedback, attendance, report data, and deterministic insights. Report Excel generation still happens in the browser with ExcelJS.

If `GET /api/batches` succeeds, create/edit batch and add/delete participant actions use the backend. If `GET /api/logs` succeeds, generated audit and notification records are also posted to the backend. If `GET /api/batches/:batchId/assessments` succeeds inside a batch detail page, assessment setup, score uploads, stats, and toppers use the backend. If `GET /api/batches/:batchId/feedback` succeeds, feedback trigger state, uploaded responses, and summaries use the backend. If `GET /api/batches/:batchId/attendance/report` succeeds, parsed Teams/Webex attendance uploads are posted to the backend and report rows/unmatched records are read back from the API. Export buttons request backend report-ready JSON first, then fall back to local batch/report state if the API is unavailable. Attendance summary text calls `POST /api/batches/:batchId/insights/generate` in API mode; the backend generates a deterministic rule-based summary and caches it by input hash. If any backend path is unavailable, the app falls back to `localStorage` or batch state without blocking the UI.
