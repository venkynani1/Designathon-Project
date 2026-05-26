<!-- Documents architecture, operations, and safe reproduction of the Mavericks Execution Platform. -->
# Mavericks Execution Platform

Mavericks Execution Platform is an enterprise training-execution system for governing live training batches from creation through attendance, assessment, participant feedback, risk intervention, topper recognition, reporting, and closure.

It was built to replace fragmented spreadsheet-and-email coordination with an auditable role-based workflow. The platform gives operations teams one place to manage trainers and participants, prove that required actions happened, communicate through controlled email workflows, and derive useful AI-assisted insight without allowing AI to replace deterministic business rules.

## What The Platform Solves

Training operations commonly need to answer:

- Which batches are running, completed, or closed?
- Were participants uploaded correctly and was attendance captured?
- Has a trainer uploaded assessment scores by the expected deadline?
- Which eligible participants were sent a feedback request?
- Which External/Segue participants require escalation to a placement officer?
- Why was a participant marked at risk or selected as topper?
- Can an administrator retrieve complete reports and delivery history later?

This application answers those questions with durable backend records, role restrictions, report exports, audit history, Azure email delivery logging, scheduled notifications, and a deterministic-first AI decision layer.

## Repository Layout

```text
mavericks-execution-platform/
|-- client/                  React + Vite browser application
|   |-- public/              Static assets
|   |-- src/
|   |   |-- components/      Role workspaces and execution modules
|   |   |-- data/            UI reference values
|   |   |-- services/        HTTP API adapters
|   |   `-- utils/           Parsing, lifecycle, export, and presentation logic
|   `-- package.json         Client commands and dependencies
|-- server/                  Express API and persistence application
|   |-- prisma/              Database schema, migrations, and safe seed
|   `-- src/
|       |-- routes/          API endpoint domains
|       |-- services/        Email, AI, upload, and rule orchestration
|       `-- utils/           Shared backend policy helpers
|-- azure-functions/         Timer-trigger notification scheduler
|-- docs/                    Supporting audits, guides, and UAT material
|-- .github/workflows/       Azure deployment automation
|-- package.json             Root command hub
`-- README.md                Authoritative project guide
```

Source, configuration, migration, workflow, asset, and documentation files that support comments begin with a short purpose statement. JSON manifests, lockfiles, and Azure `host.json` intentionally do not contain comments because JSON syntax does not permit them.

## Applications

| Application | Purpose | Runtime |
| --- | --- | --- |
| `client/` | Browser UI for Admin, Coordinator, Trainer, and participant feedback experiences | React 19, Vite, Tailwind CSS, ExcelJS |
| `server/` | Authentication, authorization, workflow APIs, persistence, reporting data, Azure Email, OpenAI integration | Node.js, Express, Prisma |
| `azure-functions/` | Scheduled execution of protected notification jobs | Azure Functions Node.js v4 timers |

## Role Model

| Role | Capabilities |
| --- | --- |
| Admin | Manage staff identities, view all trainings, reports, settings, email logs, and AI analytics |
| Coordinator | Create/edit/close batches, upload participants, manage lifecycle actions, trigger feedback, view reports and analytics |
| Trainer | Perform allowed delivery actions such as attendance and assessment score uploads for assigned work |
| Participant | Access only permitted personal/feedback experiences through real participant identity flows; not available in demo-role login |

Demo authentication, when explicitly enabled for testing, exposes only **Admin**, **Coordinator**, and **Trainer**.

## Operational Workflow

### Admin

1. Access the administrative workspace.
2. Create or deactivate Admin, Coordinator, and Trainer users subject to lockout safeguards.
3. View all training batches and retrieve reports.
4. Review settings, topper criteria, email logs, delivery diagnostics, and AI batch insight.

### Coordinator

1. Create a batch as `Internal/Mavericks` or `External/Segue`.
2. Configure schedule, dates, timings, assigned trainers, coordinator/SPOC, and meeting details.
3. Upload participant rosters:
   - Internal/Mavericks matches by `Emp ID`.
   - External/Segue matches by `Superset ID` and requires participant email, college, and placement officer email.
4. Edit batch details or close a batch when business operations require it; close preserves records and reports.
5. Remind assigned trainers to upload attendance or assessment scores.
6. Configure external feedback link and response window, upload eligible participants, and trigger reminder-counted feedback email delivery.
7. Upload feedback responses and review deterministic/OpenAI-assisted feedback analysis.
8. Review participant escalation results and export reports.

### Trainer

1. Open permitted assigned batch work.
2. Upload attendance from supported templates or meeting exports.
3. Manage allowed assessment metadata and score uploads.
4. Download score templates prefilled with participant identity rows.

### Participant And Placement Officer Communication

- Feedback requests go only to the coordinator-uploaded eligible participant list.
- Participant-facing email resolves only from participant email candidates: `email`, `empEmail`, `officialEmail`, or `participantEmail`.
- `placementOfficerEmail` is never treated as a participant email.
- External/Segue risk or onboarding escalation can notify the participant and placement officer according to policy.

## Core Business Rules

- Participant roster uploads upsert by batch-specific identity and reject duplicate identifiers within the same upload with row-level validation.
- Attendance cutoff notifications are evaluated only after the training start plus configured grace period.
- Score templates contain participant identity, score, and remarks fields, not email recipient columns.
- Topper selection remains deterministic and follows the existing first-attempt logic; AI can explain the result but does not choose it.
- Manual Coordinator close is allowed without deleting reports, participants, assessments, feedback, or audit records.
- Trainer and Participant roles cannot edit or close batches.

## Architecture

```text
Azure Static Web Apps
  React/Vite client
       |
       | HTTPS JSON API + session bearer token
       v
Azure App Service
  Express API
  |-- RBAC and validation
  |-- deterministic workflow rules
  |-- OpenAI enhancement with rule fallback
  |-- Azure Communication Services Email
  `-- Prisma ORM
       |
       v
PostgreSQL / Supabase

Azure Functions Timer Triggers
       |
       | x-scheduler-secret
       v
Express scheduler endpoints
```

### Frontend Design

The client owns interaction, controlled Excel export/download generation, upload parsing previews, workflow presentation, and authenticated API requests. It does not call OpenAI or Azure Communication Services directly.

### Backend Design

The API owns authentication, role enforcement, database writes, recipient resolution, notification policy, email transport, AI invocation/fallback, scheduler endpoints, report data endpoints, and audit persistence.

### Persistence

Prisma models cover:

- users and access status
- batches and participants
- assessments, results, and evidence metadata
- feedback runs and feedback responses
- attendance sessions, records, versions, and summaries
- notifications, email logs, and operational logs
- AI insight cache
- trainer profiles, placement officer mappings, and system settings

Migrations are versioned under `server/prisma/migrations/`.

## AI-Assisted Decision Layer

The AI decision layer is backend-only and transparent:

- Participant risk classification: `LOW`, `MEDIUM`, `HIGH`
- Batch executive summary and health insights
- Feedback theme/rating analysis
- Topper justification narrative based on deterministic topper output
- Anomaly reporting for identity, attendance, score, and contact-data concerns
- Professional email wording for reminder/escalation messages

Rule-based results are always available. OpenAI is used only when enabled and configured; provider failures or rate limiting return deterministic output. AI does not alter topper selection or silently invent operational facts.

Recommended server configuration:

```env
AI_PROVIDER="openai"
OPENAI_API_KEY="<store-in-app-configuration-or-key-vault>"
OPENAI_MODEL="gpt-4o-mini"
AI_EMAIL_ENABLED="true"
AI_DECISION_ENABLED="true"
AI_DECISION_MAX_TOKENS="800"
AI_DECISION_TIMEOUT_MS="8000"
```

Never expose `OPENAI_API_KEY` in client variables, committed files, screenshots, or logs.

## Email Delivery And Throttling

Azure Communication Services Email sends all real notifications. The service:

- validates configured sender identity and connection-string shape before sending
- waits for Azure poller completion
- records safe provider diagnostics without logging credentials
- queues Azure sends sequentially with pacing
- retries only transient failures such as `429`, timeout, or service unavailability
- exposes clean workflow statuses while preserving diagnostic detail in restricted logs

Configuration:

```env
AZURE_COMMUNICATION_CONNECTION_STRING="endpoint=https://<communication-resource>.<region>.communication.azure.com/;accesskey=<secret>"
AZURE_EMAIL_FROM_ADDRESS="DoNotReply@<verified-sender-domain>"
AZURE_EMAIL_QUEUE_DELAY_MS="1200"
AZURE_EMAIL_RETRY_DELAYS_MS="2000,5000,10000"
```

For this deployed solution, the backend sender-validation constant must correspond to the verified sender provisioned in Azure Communication Email. When reproducing the system with a new Azure domain, update the expected verified sender in the email service and set the matching App Service environment value.

Admin and Coordinator can run a controlled test via:

```http
POST /api/notifications/email-diagnostics
Content-Type: application/json

{ "to": "approved-test-recipient@example.com" }
```

The primary workflow UI displays enterprise-safe states such as `Sent`, `Retrying`, `Temporarily unavailable`, and `Failed`. Technical provider codes, retry counts, and request IDs belong in restricted Email Logs/Diagnostics and backend logs.

## Downloaded File Naming

Templates keep stable operational names because users upload those same files back into the workflow:

- `mavericks-batch-template.xlsx`
- `mavericks-internal-participant-template.xlsx`
- `mavericks-external-participant-template.xlsx`
- assessment score and feedback eligible participant files retain `template` in their name

Populated reports now use a human-readable convention:

```text
<Training Name> - <Report Type> - <Month Year>.xlsx
```

Examples:

```text
AI Training - Feedback Report - May 2026.xlsx
AI Training - Teams Attendance Report - May 2026.xlsx
AI Training - Assessment Report - May 2026.xlsx
AI Training - Consolidated Batch Report - May 2026.xlsx
```

Unsafe filesystem characters are removed from generated report names.

## Local Setup From A Fresh Clone

### Prerequisites

- Git
- Node.js 20 or later
- npm
- PostgreSQL-compatible database, or Supabase PostgreSQL
- Azure Functions Core Tools only when running timers locally

### 1. Clone

```bash
git clone <repository-url>
cd mavericks-execution-platform
```

### 2. Install Dependencies

```bash
cd client && npm install && cd ..
cd server && npm install && cd ..
cd azure-functions && npm install && cd ..
```

### 3. Configure Client

Windows PowerShell:

```powershell
Copy-Item client/.env.example client/.env
```

macOS/Linux:

```bash
cp client/.env.example client/.env
```

`client/.env`:

```env
VITE_API_BASE_URL="http://localhost:4000/api"
```

This is a public browser-visible API URL, not a secret.

### 4. Configure Server

Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

macOS/Linux:

```bash
cp server/.env.example server/.env
```

Minimum local backend configuration:

```env
NODE_ENV="development"
PORT="4000"
CORS_ORIGIN="http://localhost:5173"
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>?schema=public"
JWT_SECRET="<long-random-local-secret>"
ENABLE_DEMO_AUTH="true"
```

For local development without Azure Email or OpenAI, leave those integration values unset; deterministic/mock behavior is used where supported. Do not commit `server/.env`.

### 5. Initialize Database

```bash
cd server
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
cd ..
```

When `ENABLE_DEMO_AUTH=true`, seed creates only Admin, Coordinator, and Trainer demo identities. It does not create a participant demo login.

### 6. Run Locally

Terminal 1:

```bash
cd server
npm run dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Optional scheduler terminal:

```bash
cd azure-functions
npm start
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health endpoint: `http://localhost:4000/api/health`

## Environment Variable Reference

### Client

| Variable | Purpose | Secret |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Public backend API base URL compiled into frontend build | No |

### Server

| Variable | Purpose | Secret |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | No |
| `PORT` | Express listener port | No |
| `CORS_ORIGIN` | Permitted client origin | No |
| `DATABASE_URL` | Prisma database connection | Yes |
| `DIRECT_URL` | Optional direct migration connection | Yes |
| `JWT_SECRET` | Session token signing secret | Yes |
| `ENABLE_DEMO_AUTH` | Enables non-production demo role sign-in | No |
| `AZURE_COMMUNICATION_CONNECTION_STRING` | Azure email API credential and endpoint | Yes |
| `AZURE_EMAIL_FROM_ADDRESS` | Verified Azure Email sender address | No |
| `AZURE_EMAIL_QUEUE_DELAY_MS` | Send pacing interval | No |
| `AZURE_EMAIL_RETRY_DELAYS_MS` | Transient retry schedule | No |
| `SCHEDULER_SECRET` | Protects scheduler API endpoints | Yes |
| `AI_PROVIDER` | AI provider selector | No |
| `OPENAI_API_KEY` | Server-side OpenAI credential | Yes |
| `OPENAI_MODEL` | Model for configured AI operations | No |
| `AI_EMAIL_ENABLED` | Enables AI-assisted email wording | No |
| `AI_DECISION_ENABLED` | Enables AI decision enhancement | No |
| `AI_DECISION_MAX_TOKENS` | Cost/output control | No |
| `AI_DECISION_TIMEOUT_MS` | AI request timeout | No |

### Azure Functions

| Variable | Purpose | Secret |
| --- | --- | --- |
| `API_BASE_URL` | App Service backend URL | No |
| `SCHEDULER_SECRET` | Must match server scheduler secret | Yes |
| `AzureWebJobsStorage` | Azure Functions runtime storage | Yes |
| `FUNCTIONS_WORKER_RUNTIME` | Must be `node` | No |

## Azure Infrastructure Reproduction Guide

The repository contains application code, not infrastructure credentials. The following steps recreate an equivalent Azure deployment.

### 1. Resource Group And Database

1. Create an Azure Resource Group for the application resources.
2. Provision PostgreSQL or create a Supabase PostgreSQL project.
3. Capture a pooled application connection string for `DATABASE_URL`.
4. Capture a direct migration connection string for `DIRECT_URL` when required by the database provider.
5. From a trusted workstation or deployment job, run:

```bash
cd server
npx prisma generate
npx prisma migrate deploy
```

### 2. Azure Communication Services Email

1. Create an **Email Communication Service** resource.
2. Provision or connect a sender domain and complete Azure domain verification requirements.
3. Create an **Azure Communication Services** resource.
4. Connect its Email domain to the Communication Services resource.
5. Retrieve the Communication Services connection string securely.
6. Record the verified `DoNotReply@...` sender address.
7. Configure those values only in App Service Configuration or Azure Key Vault references.
8. Configure paced delivery and retry values.
9. After deployment, use the protected Email Diagnostics control with an approved test mailbox.

### 3. Azure App Service API

1. Create a Linux Node.js App Service using a supported current Node runtime.
2. Set startup/deployment to serve the `server/` application (`npm start`).
3. Add server environment variables in **Configuration > Application settings**.
4. Keep `ENABLE_DEMO_AUTH=false` in real production environments.
5. Add a long randomly generated `JWT_SECRET` and `SCHEDULER_SECRET`.
6. Configure database, Azure Email, and optional OpenAI values.
7. Confirm `GET https://<api-app>.azurewebsites.net/api/health` responds without exposing secrets.

The included workflow [.github/workflows/deploy-api.yml](.github/workflows/deploy-api.yml) tests and deploys `server/`. Set the repository secret `AZURE_WEBAPP_PUBLISH_PROFILE` from the App Service publish profile. Store database secrets as repository secrets only when required by that workflow.

### 4. Azure Static Web Apps Client

1. Create an Azure Static Web App connected to the GitHub repository.
2. Use application location `/client` and output location `dist`.
3. Configure repository variable:

```text
VITE_API_BASE_URL=https://<api-app>.azurewebsites.net/api
```

4. Store the Static Web Apps deployment token as the workflow secret expected by [.github/workflows/azure-static-web-apps-gray-bay-079a50200.yml](.github/workflows/azure-static-web-apps-gray-bay-079a50200.yml).
5. Deploy and confirm the client can load auth configuration from the API.

### 5. Azure Functions Scheduler

1. Create a Storage Account for Azure Functions runtime requirements.
2. Create a Node.js Azure Function App.
3. Configure:

```env
API_BASE_URL="https://<api-app>.azurewebsites.net"
SCHEDULER_SECRET="<same-value-as-api>"
AzureWebJobsStorage="<storage-connection-string>"
FUNCTIONS_WORKER_RUNTIME="node"
```

4. Deploy:

```bash
cd azure-functions
func azure functionapp publish <function-app-name>
```

Timer functions call protected endpoints for attendance cutoff, consecutive absence, onboarding, and assessment reminders. Timer schedules are maintained in `azure-functions/src/functions.js` and run in UTC.

### 6. OpenAI Configuration

1. Create an OpenAI API key in the appropriate secured account/project.
2. Store it only in App Service Configuration or a Key Vault reference.
3. Enable AI flags only after budget, rate limit, and access review.
4. Validate that deterministic fallback remains functional when AI is disabled or temporarily rate-limited.

## API Domains

Major route domains mounted beneath `/api`:

| Domain | Representative responsibility |
| --- | --- |
| `/health` | Readiness without secret disclosure |
| `/auth/*` | Auth configuration, demo login, authenticated identity |
| `/users/*` | Staff user management and status |
| `/batches/*` | Batch, participant, lifecycle, edit/close, reminders |
| `/batches/:id/attendance/*` | Attendance upload and report data |
| `/batches/:id/assessments/*` | Assessment metadata, score results, stats, topper inputs |
| `/batches/:id/feedback/*` | Feedback setup, trigger, response upload, summary |
| `/batches/:id/reports/*` | Report-ready backend data |
| `/batches/:id/ai-*` | Restricted AI analytics and generated insight |
| `/notifications/*` | Logs, verification, diagnostics, scheduled execution |
| `/logs`, `/settings`, `/trainer-profiles`, `/placement-officers` | Governance and configuration records |
| `/participant/dashboard` | Restricted participant-specific data |

Authorization remains enforced server-side; hiding UI controls is not considered access protection.

## Scheduler Jobs

| Job | Responsibility |
| --- | --- |
| Attendance cutoff | Alerts when attendance is not uploaded after start-time grace policy |
| Consecutive absence | Detects repeated absence and External/Segue escalations |
| Onboarding | Reminds/escalates unresolved onboarding status |
| Assessment reminder | Executes configured assessment reminder policy |

The Functions application sends `x-scheduler-secret` to the API. Do not place that value in code or logs.

## Testing And Release Verification

Run the complete repository verification from the root:

```bash
npm run verify
```

Equivalent individual commands:

```bash
npm test
npm run build
cd server && npm test && npx prisma validate && cd ..
cd azure-functions && npm test && cd ..
```

Coverage includes:

- participant upload upsert/validation behavior
- lifecycle close and reminder recipient policy
- assessment and feedback workflows
- deterministic AI/rating fallback behavior
- Azure Email diagnostics, throttling retries, and queue pacing
- role restrictions and demo-login limits
- parser/export helper behavior
- scheduler backend-client calls

## Production UAT Checklist

1. Admin signs in and creates active Coordinator and Trainer identities.
2. Coordinator creates an Internal/Mavericks batch and uploads participants.
3. Coordinator sends trainer attendance reminder; verify Email Logs.
4. Trainer uploads attendance.
5. Coordinator/Trainer creates assessment metadata.
6. Coordinator uses **Remind Trainer** for score upload; verify delivery summary and Email Logs.
7. Trainer downloads score template and uploads scores.
8. Coordinator configures feedback URL/deadline and uploads eligible participant list.
9. Coordinator triggers feedback; confirm only eligible participant emails were targeted.
10. Participant submits feedback through allowed identity/link flow.
11. Coordinator uploads/analyses feedback responses and downloads reports.
12. Admin verifies all training/report visibility.
13. External/Segue batch validates participant plus placement-officer escalation behavior.
14. Admin/Coordinator runs Email Diagnostics after deployment or email configuration changes.

## Security And Sensitive Data Rules

- Never commit `.env`, Azure connection strings, database passwords, JWT secrets, scheduler secrets, publish profiles, or OpenAI keys.
- Never put backend credentials in `VITE_*` values; Vite values are visible in the browser bundle.
- Keep production demo authentication disabled.
- Restrict Email Logs and AI analytics to authorized roles.
- Use Key Vault references or protected App Service/Function App configuration for production secrets.
- Review exported participant reports as operational data and store them according to organizational privacy policy.

## Supporting Documents

The `docs/` directory contains migration, UAT, and implementation supporting records. This README is the authoritative current setup and operations guide; older audit/context documents may describe historical stages before subsequent production enhancements.
