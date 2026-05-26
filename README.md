# Mavericks Execution Platform

Mavericks Execution Platform is a React + Vite training execution application backed by an Express API, Prisma, and PostgreSQL.

Current architecture:

```text
React/Vite UI -> frontend services -> Express API -> Prisma -> PostgreSQL
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
JWT_SECRET="replace-with-a-long-random-secret"
ENABLE_DEMO_AUTH="false"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
```

Set frontend API URL in `.env` if needed:

```text
VITE_API_BASE_URL="http://localhost:4000/api"
```

Generate Prisma client and run migrations:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate -- --name init
cd ..
```

The database starts without sample batches, participants, trainers, logs, or notifications. When `ENABLE_DEMO_AUTH=false`, `npm run prisma:seed` is non-mutating. For temporary testing with the role selector, set `ENABLE_DEMO_AUTH=true` in `server/.env` and run `cd server && npm run prisma:seed` to provision only the three demo login users: Admin, Coordinator, and Trainer. The seed script loads `server/.env` directly so the flag also applies during `prisma db seed`.

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

## Azure Production Deployment

Do not commit real `.env` files or Azure Function `local.settings.json`. Configure secrets in Azure App Service / Function App Configuration or Key Vault references.

### Azure App Service Backend

Deploy the `server/` project as a Node.js Azure App Service. Required App Service configuration values:

```text
NODE_ENV=production
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=public
DIRECT_URL=postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres?schema=public
JWT_SECRET=<long-random-secret>
AZURE_COMMUNICATION_CONNECTION_STRING=<azure-communication-services-connection-string>
AZURE_EMAIL_FROM_ADDRESS=DoNotReply@<verified-azure-email-domain>
AI_PROVIDER=openai
OPENAI_API_KEY=<backend-only-openai-api-key>
OPENAI_MODEL=gpt-4o-mini
AI_EMAIL_ENABLED=true
SCHEDULER_SECRET=<shared-scheduler-secret>
CORS_ORIGIN=<frontend-origin>
PORT=4000
```

Use the Supabase session pooler URL for `DATABASE_URL` in App Service. Use `DIRECT_URL` only for Prisma migration workflows that need a direct connection. Never place the real Supabase password, Azure connection string, JWT secret, or scheduler secret in committed source files.

Backend startup fails fast in production if these are missing:

- `DATABASE_URL`
- `JWT_SECRET`
- `AZURE_COMMUNICATION_CONNECTION_STRING`
- `AZURE_EMAIL_FROM_ADDRESS`
- `SCHEDULER_SECRET`

Local and test mode still allow mock email/scheduler-safe behavior.

Notification email content is generated on the backend only. When `AI_EMAIL_ENABLED=true`,
the API uses `AI_PROVIDER=openai` and `OPENAI_MODEL` for participant reminders, external
placement officer escalations, assessment reminders, onboarding reminders, and coordinator
feedback requests. If `OPENAI_API_KEY` is missing, AI is disabled, or the provider request
fails/times out, deterministic templates are sent through the configured Azure Email provider
and the fallback is recorded in email metadata; the API does not crash.

### GitHub Actions API Deployment

The backend API deploys to Azure App Service with the workflow `Deploy API to Azure App Service`.

Create the GitHub repository secret:

```text
AZURE_WEBAPP_PUBLISH_PROFILE
```

To get the publish profile, open the Azure Portal, go to App Services, select `Maverick-Execution-api`, and choose **Get publish profile**. Paste the downloaded publish profile XML into the GitHub secret value. Do not commit the publish profile file.

The workflow runs on pushes to `main` and can also be started manually from GitHub Actions with **Run workflow**. It runs from `server/`, installs dependencies with `npm ci`, generates the Prisma client, runs API tests, and deploys only the `server/` folder through `azure/webapps-deploy@v3`.

Deployment logs are available in the repository's **Actions** tab under `Deploy API to Azure App Service`. Azure runtime logs are available in the `Maverick-Execution-api` App Service under **Log stream** or **Deployment Center**.

Health/readiness:

```text
GET /api/health
```

The response reports `db`, `emailProvider`, and `schedulerConfigured` without exposing secrets.

### Azure Static Web Apps Frontend

The frontend calls the backend API during startup to resolve authentication mode. Configure this GitHub Actions repository variable before deploying the Static Web App:

```text
VITE_API_BASE_URL=https://Maverick-Execution-api.azurewebsites.net/api
```

Vite embeds this public API URL at frontend build time. The Static Web Apps workflow passes `vars.VITE_API_BASE_URL` into the build. Without it, a production bundle shows a configuration error rather than attempting localhost or incorrectly rendering the production sign-in screen.

To display the testing role selector, also set this backend App Service configuration value and restart/redeploy the backend:

```text
ENABLE_DEMO_AUTH=true
```

### Supabase PostgreSQL

Apply Prisma migrations before or during backend deployment:

```bash
cd server
npx prisma migrate deploy
```

For local migration development:

```bash
cd server
npm run prisma:migrate
```

### Azure Communication Services Email

Configure:

- `AZURE_COMMUNICATION_CONNECTION_STRING`
- `AZURE_EMAIL_FROM_ADDRESS`

The from address must belong to the verified Azure Email domain. Email attempts are logged to `EmailLog`; the connection string is never returned by APIs or health checks.

### Azure Functions Scheduler

Deploy the `azure-functions/` project as a Node.js Azure Function App. Required Function App configuration values:

```text
API_BASE_URL=https://<backend-app-service>.azurewebsites.net
SCHEDULER_SECRET=<same-shared-scheduler-secret-as-backend>
AzureWebJobsStorage=<function-storage-connection-string>
FUNCTIONS_WORKER_RUNTIME=node
```

Deploy:

```bash
cd azure-functions
npm install
func azure functionapp publish <function-app-name>
```

The functions call the backend scheduler endpoints with `x-scheduler-secret`; they never log the secret.

## Access Control

- Admin and Coordinator manage batch, participant, feedback, notification, and reporting flows.
- Trainer access remains limited to delivery functions and assessment reporting; consolidated, topper, attendance, and feedback report reads require Admin or Coordinator.
- Participant receives only `GET /api/participant/dashboard`, which selects assignments by the authenticated participant email and returns personal attendance plus optional read-only upcoming assessments.
- Participant cannot read batch registry, lifecycle, reports, feedback management, assessment management, logs, notification logs, trainer profiles, placement-officer mappings, or system settings.
- Frontend operational records are loaded from and written to backend APIs; there is no localStorage business-data fallback or startup sample dataset.

The frontend loads the auth mode from `GET /api/auth/config`. When backend `ENABLE_DEMO_AUTH=true`, it displays a clearly marked **Demo Mode** role selector for Admin, Coordinator, and Trainer and uses `POST /api/auth/demo-login` for testing. Participant access remains available only through real participant identity flows, including feedback links. When `ENABLE_DEMO_AUTH=false`, no role selector is exposed and the frontend loads the production identity from `GET /api/auth/me`. Keep demo authentication disabled in production.

## Coordinator Batch Upload Flow

The Coordinator/Admin batch registry now includes a Coordinator Batch Operations section. It keeps the existing manual create/edit forms and adds Excel-assisted operations:

- Download Batch Template creates an `.xlsx` file with training, schedule, trainer, meeting platform, and batch type columns.
- Upload Batch Excel parses the file in the browser with ExcelJS, validates each row, previews row-level errors, and submits valid rows through `POST /api/batches`.
- Selected batch controls allow participant template downloads, participant upload preview, valid participant submission through `POST /api/batches/:batchId/participants`, and Close Batch through `PATCH /api/batches/:batchId/status`.
- Submissions are persisted through the backend API; a failed request does not create a local operational record.

Batch template fields:

```text
Training Name, Start Date, End Date, Schedule Type, Custom Dates, Timings,
Trainer Type, Trainer Name, Trainer Email, Trainer Emp ID,
Trainer Unit/Competency, Meeting Platform, Batch Type
```

Allowed values:

- Schedule Type: `All Days`, `Custom Dates`
- Trainer Type: `External`, `Hexavarsity`
- Meeting Platform: `Teams`, `Webex`
- Batch Type: `Internal/Mavericks`, `External/Segue`

Participant templates:

- Internal/Mavericks: `Emp ID`, `Emp Name`
- External/Segue: `Superset ID`, `Emp Name`, `Emp Email`, `Mobile No`, `College Name`, `Placement Officer Mail ID`

## Coordinator Lifecycle

Batch detail now shows a simplified six-step Coordinator Lifecycle:

1. Batch Created
2. Attendance Uploaded
3. Assessment Scores Uploaded
4. Feedback Triggered
5. Topper Identified and Consolidated Report Exported
6. Batch Closed

The lifecycle is derived from backend batch, attendance, assessment, feedback, and log data.

Workflow rules:

- Attendance uploaded within 15 minutes of the training start time is `Uploaded On Time`; later upload is `Uploaded Late`; missing upload after the window is `Missing`; reminders are persisted and sent through the configured email service.
- Coordinator/Admin can set `assessmentScoreDeadline`; score uploads before/after that deadline show as `Uploaded Before Deadline` or `Uploaded Late`; missed deadlines show `Overdue`.
- Feedback trigger is guarded until the training end date has passed or the batch is completion-ready/closed.
- Participant Excel downloads are separate: `Internal/Mavericks` requires `Emp ID` and `Emp Name`
  (with optional `Official Email`), while `External/Segue` requires `Superset ID`, `Emp Name`,
  `Emp Email`, `College Name`, and `Placement Officer Mail ID` and includes optional `Mobile No`.
- External/Segue attendance, low-score, and post-training onboarding incidents send separate
  participant and placement-officer emails; Internal/Mavericks incidents never email placement officers.
- Consolidated report export remains frontend-generated and is tracked through existing report export logs.
- Batch close requires attendance uploaded or reviewed, assessment scores uploaded or reviewed, feedback triggered, topper/report signal present, and report export logged. Coordinator/Admin can close; Trainer cannot close; Participant is read-only.

## Backend Endpoints

Auth and health:

- `GET /api/health`
- `GET /api/auth/config`
- `POST /api/auth/demo-login` (disabled by default; local testing only)
- `GET /api/auth/me`

Batches and participants:

- `GET /api/participant/dashboard` (Participant only; own assignment and attendance data)
- `GET /api/batches`
- `GET /api/batches/:batchId`
- `POST /api/batches`
- `PUT /api/batches/:batchId`
- `PATCH /api/batches/:batchId/status`
- `GET /api/batches/:batchId/lifecycle`
- `PATCH /api/batches/:batchId/assessment-deadline`
- `POST /api/batches/:batchId/reminders/attendance`
- `POST /api/batches/:batchId/reminders/assessment`
- `PATCH /api/batches/:batchId/close`
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
- Backend startup validates required production settings and fails fast without logging secrets.
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
