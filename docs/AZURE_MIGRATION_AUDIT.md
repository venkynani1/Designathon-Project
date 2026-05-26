<!-- Documents architecture, operations, or decisions for the Mavericks Execution Platform. -->
# Mavericks Execution Platform Azure Migration Audit

Date: 2026-05-06

Scope: This audit covers the active application source in `src/`, plus root project documentation where it describes current behavior. `node_modules/` and `dist/` are not treated as authoritative source because they are dependency/build artifacts. The current app is a React + Vite single-page application with browser-local persistence and browser-side CSV/report processing.

External Azure references used for cost and service posture:

- Azure SQL Database free offer: https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer
- Azure Static Web Apps plans: https://learn.microsoft.com/en-us/azure/static-web-apps/plans
- Azure OpenAI / Foundry model availability: https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- Azure OpenAI pricing page: https://azure.microsoft.com/en-us/pricing/details/azure-openai/

---

## 1. Current Architecture Overview

### High-level architecture

The Mavericks Execution Platform is currently a frontend-only React application built with Vite. It runs entirely in the browser and has no backend API, no server-side authentication, no Azure SQL connection, and no Azure OpenAI integration.

The main application flow is:

1. `src/main.jsx` mounts the React app.
2. `src/App.jsx` owns top-level routing, role selection, batch state, log state, dashboard rendering, and localStorage persistence.
3. The app uses browser path navigation through `window.history.pushState()` and `window.location.pathname`.
4. Batches are loaded from localStorage, falling back to `mockBatches`.
5. Logs and notification-like alerts are loaded from localStorage, falling back to `mockLogs`.
6. Batch screens allow creating/editing batches, adding/removing participants, uploading attendance CSV files, configuring assessments, uploading scores, triggering/uploading feedback, exporting reports, and viewing logs.
7. Every state mutation happens in React state first.
8. Persistent state is written back to browser localStorage.

There is no request/response boundary today. All application state, calculations, validation, CSV parsing, report generation, and "AI" summary text generation occur in the frontend runtime.

### Current frontend-only areas

These areas are completely frontend-only:

| Area | Current implementation | Notes |
|---|---|---|
| Routing | `src/App.jsx` uses `window.history` and `window.location` | No router package and no server route handling. |
| Role selection | `src/App.jsx` role selector | Simulated RBAC only. No login, token, claims, or user directory. |
| Dashboard metrics | Hardcoded role metrics in `src/App.jsx` plus batch-derived stats | Not backed by real operational data. |
| Batch management | `src/components/BatchManagement.jsx` mutates React state through callbacks | Persisted through the `mavericks_phase2_batches` localStorage key. |
| Participant management | `BatchManagement.jsx` adds/removes participants inside the batch object | Persisted as nested arrays in the batch object. |
| Attendance upload | `src/components/uploads/TeamsAttendanceUpload.jsx` | CSV files parsed in browser and saved per batch/provider in localStorage. |
| Teams parsing | `src/utils/teamsParser.js` and `src/utils/attendanceEngine.js` | Browser-side PapaParse processing. |
| Webex parsing | `src/utils/webexParser.js` and `src/utils/attendanceEngine.js` | Browser-side PapaParse processing. |
| Attendance risk | `src/utils/attendanceEngine.js` | Deterministic browser-side rules. |
| Assessments | `src/components/AssessmentModule.jsx` and `src/utils/assessmentEngine.js` | Assessment setup and uploaded results live inside the batch object. |
| Feedback | `src/components/FeedbackModule.jsx` and `src/utils/feedbackEngine.js` | Feedback trigger state and responses live inside the batch object. |
| Notifications | `src/utils/notificationEngine.js` and `src/components/LogsPanel.jsx` | Generated as local log objects, not actually delivered. |
| Audit logs | Stored in `mavericks_execution_logs` | Browser-local only. |
| Reports | `src/utils/attendanceExport.js` and `src/utils/assessmentEngine.js` | Excel/CSV files generated in browser with `Blob`, `URL.createObjectURL`, and dynamic `exceljs` import. |
| AI summaries | `generateBatchSummary()` and `generateFeedbackSummary()` | Rule-based strings, not true AI calls. |

### What uses localStorage

All localStorage access is routed through:

- `src/utils/storage.js`
  - `loadFromStorage(key, fallbackValue)`
  - `saveToStorage(key, value)`

Call sites:

- `src/App.jsx`
  - `mavericks_phase2_batches`
  - `mavericks_execution_logs`
- `src/components/uploads/TeamsAttendanceUpload.jsx`
  - `mavericks_teams_attendance_${batchId}`
  - `mavericks_webex_attendance_${batchId}`

There is no `sessionStorage` usage and no IndexedDB usage in the source.

### What uses mock data

Mock data is defined in `src/data/mockData.js`:

- `lifecycleStatuses`
- `trainingTypes`
- `batchTimelineSteps`
- `mockBatches`
- `mockLogs`

Mock data is imported by:

- `src/App.jsx`
- `src/components/BatchManagement.jsx`

There is also hardcoded demo data inside `src/App.jsx` that is not imported from `mockData.js`, including role dashboard metrics, activity messages, focus lists, role descriptions, and simulated role visibility constants.

### What logic is purely browser-side

Pure browser-side logic includes:

- Batch create/edit/delete-like mutations.
- Participant add/remove.
- CSV file validation and parsing.
- Teams and Webex attendance normalization.
- Attendance duration filtering.
- Roster matching by employee ID, email, and name.
- Attendance percentage and consecutive absence calculations.
- Assessment score upload validation.
- Weighted assessment/topper calculation.
- Feedback CSV parsing and rating summary.
- Risk level and recommended action calculation.
- Notification/audit object generation.
- Report workbook generation and file download.
- Simulated RBAC filtering for trainer and participant views.
- Dashboard metric calculation from locally available batches.

---

## 2. LocalStorage Dependency Audit

### Central storage wrapper

| File | Function | Browser API | Purpose | Migration recommendation |
|---|---|---|---|---|
| `src/utils/storage.js` | `loadFromStorage(key, fallbackValue)` | `window.localStorage.getItem()` | Reads JSON from localStorage and falls back on parse failure or missing key. | Replace most business data reads with API calls. Keep wrapper only for local UI preferences if needed. |
| `src/utils/storage.js` | `saveToStorage(key, value)` | `window.localStorage.setItem()` | Serializes JSON and writes it to localStorage. | Stop using for enterprise data. Use backend persistence for batches, participants, attendance, assessments, feedback, logs, and notifications. |

### Key: `mavericks_phase2_batches`

| Item | Details |
|---|---|
| File | `src/App.jsx` |
| Key name | `mavericks_phase2_batches` |
| Loaded by | `loadFromStorage(BATCH_STORAGE_KEY, mockBatches)` |
| Saved by | `saveToStorage(BATCH_STORAGE_KEY, batches)` in a `useEffect` whenever `batches` changes |
| Fallback | `mockBatches` from `src/data/mockData.js` |
| Data shape | Array of full batch objects |

Data stored under this key:

- Batch identity: `id`, `batchId`.
- Training details: `trainingName`, `trainingType`, `startDate`, `endDate`, `timings`, `status`.
- Trainer details: `trainer.name`, `trainer.email`, `trainer.phone`, `trainer.specialization`.
- Coordinator details: `coordinatorSpoc`.
- Meeting link: `meetingLink`.
- Participants:
  - Internal: `id`, `empId`, `empName`, `officialEmail`.
  - External/Segue: `id`, `name`, `email`, `mobileNumber`.
- Assessments:
  - Assessment setup: `id`, `name`, `type`, `date`, `cutoffScore`, `maxScore`, `weightage`, `createdAt`.
  - Results: `participantId`, `empId`, `name`, `email`, `scorePercent`, `comments`, `cleared`, `uploadedAt`.
  - Upload metadata: `uploadedFileName`, `uploadedAt`.
- Feedback:
  - Trigger/upload metadata: `triggeredAt`, `uploadedAt`, `uploadedFileName`.
  - Generated summary string.
  - Response rows: `id`, `participantId`, `empId`, `name`, `email`, `rating`, `comments`, `matched`, `uploadedAt`.
- Health snapshot:
  - `attendanceUploaded`, `highRisk`, `mediumRisk`, `assessmentClearance`.
- Discontinued candidates:
  - `discontinuedParticipantIds`.
- Timeline:
  - Status by lifecycle step.

Purpose:

- This is the main application database today.
- It is used by dashboards, batch registry, batch detail pages, participant management, assessment setup/results, feedback state, reports, health calculations, lifecycle display, and role-filtered visibility.

Should it move to Azure SQL?

- Yes. Almost everything inside this key is enterprise data and should move to Azure SQL.
- The batch object should be normalized into separate relational tables:
  - `batches`
  - `participants`
  - `assessments`
  - `assessment_results`
  - `feedback`
  - `feedback_responses`
  - `attendance_summary`
  - optional `batch_lifecycle_events` or lifecycle fields
- Do not keep this key for production/demo enterprise data.
- It can remain temporarily as a development fallback only during migration, behind a clear "demo local mode" flag.

Recommended field movement:

| Nested data | Move to Azure SQL? | Target |
|---|---:|---|
| Batch core fields | Yes | `batches` |
| Trainer fields | Yes | Either fields on `batches` for demo simplicity, or `trainers` later |
| Coordinator SPOC | Yes | `batches.coordinator_spoc` |
| Participants | Yes | `participants` |
| Assessments | Yes | `assessments` |
| Assessment results | Yes | `assessment_results` |
| Feedback trigger/upload metadata | Yes | `feedback` |
| Feedback responses | Yes | `feedback_responses` |
| Health snapshot | Hybrid | Recompute from source data; optionally cache in `attendance_summary` or `batch_health_snapshots` |
| Discontinued participant IDs | Yes | `participants.status` or `participant_status_history` |
| Timeline | Hybrid | Derive from source records; optionally store events/status in `batch_lifecycle_events` |

### Key: `mavericks_execution_logs`

| Item | Details |
|---|---|
| File | `src/App.jsx` |
| Key name | `mavericks_execution_logs` |
| Loaded by | `loadFromStorage(LOG_STORAGE_KEY, mockLogs)` |
| Saved by | `saveToStorage(LOG_STORAGE_KEY, logs)` in a `useEffect` whenever `logs` changes |
| Fallback | `mockLogs` from `src/data/mockData.js` |
| Data shape | Array of log/notification objects |

Data stored:

- `id`
- `action`
- `batchId`
- `category`
- `createdAt`
- `level`
- `message`
- `recipient`
- `status`
- `type`

Purpose:

- Stores both audit events and notification-like alerts.
- The UI displays alerts in "Notification Center" and all recent records in "Audit Trail".
- `appendLogs()` deduplicates logs by `action|batchId|message` and keeps only the latest 200.

Current producers:

- Batch created.
- Batch edited.
- Participant added.
- Participant removed.
- Attendance missing.
- Attendance uploaded.
- Three-day absence alert.
- Assessment created.
- Assessment reminder.
- Assessment upload.
- Feedback trigger.
- Feedback upload.
- Report exports.

Should it move to Azure SQL?

- Yes.
- Split conceptually into:
  - `audit_logs` for immutable system/user actions.
  - `notifications` for alert/reminder records that have recipient, status, level, and category.
- For a designathon demo, both can be SQL tables populated by one backend endpoint. The UI can still show them together.

### Key pattern: `mavericks_teams_attendance_${batchId}`

| Item | Details |
|---|---|
| File | `src/components/uploads/TeamsAttendanceUpload.jsx` |
| Key name | `mavericks_teams_attendance_${batchId}` |
| Example key | `mavericks_teams_attendance_MB-IN-2401` |
| Created by | `getStorageKey(batch.batchId, attendanceSource)` |
| Used when | `batch.trainingType` is not `External` or `Segue` |
| Loaded by | `loadFromStorage(storageKey, null)` |
| Saved by | `saveToStorage(storageKey, trainingDetails)` |
| Data shape | Processed Teams attendance details |

Data stored:

- `source`: `Teams`
- `trainingName`
- `dateCount`
- `trainingParticipant`: array of session objects
  - `date`
  - `participants`: normalized attendee rows
    - `id`
    - `trainingName`
    - `empId`
    - `name`
    - `email`
    - `duration`
    - `durationMinutes`
    - `firstJoin`
    - `lastLeave`
    - `role`
    - `raw`

Purpose:

- Stores uploaded Teams attendance after parsing and duration filtering.
- Allows attendance report tables and summary to remain available after browser refresh.
- Used by `prepareAttendanceReport()` to calculate attendance, risk, unmatched attendees, and summary text.

Should it move to Azure SQL?

- Yes, for enterprise data.
- Move parsed session-level and participant-level attendance into:
  - `attendance_sessions`
  - `attendance_records` or child rows under `attendance_sessions`
  - `attendance_summary`
- Keep raw CSV files out of SQL for the demo. If raw-file retention is required later, use Blob Storage, but do not add Blob Storage for the first migration unless it is explicitly needed.
- Keep the browser parser during the first demo migration, but POST parsed canonical records to the backend.

### Key pattern: `mavericks_webex_attendance_${batchId}`

| Item | Details |
|---|---|
| File | `src/components/uploads/TeamsAttendanceUpload.jsx` |
| Key name | `mavericks_webex_attendance_${batchId}` |
| Example key | `mavericks_webex_attendance_MB-EX-2402` |
| Created by | `getStorageKey(batch.batchId, attendanceSource)` |
| Used when | `batch.trainingType` is `External` or `Segue` |
| Loaded by | `loadFromStorage(storageKey, null)` |
| Saved by | `saveToStorage(storageKey, trainingDetails)` |
| Data shape | Processed Webex attendance details |

Data stored:

- `source`: `Webex`
- `trainingName`
- `dateCount`
- `trainingParticipant`: array of session objects
  - `date`
  - `participants`: normalized attendees
    - `id`
    - `name`
    - `email`
    - `durationMinutes`

Purpose:

- Stores uploaded Webex attendance after parsing, breakout filtering, duplicate attendee aggregation, and minimum-duration filtering.
- Supports the same report/risk/summary path as Teams.

Should it move to Azure SQL?

- Yes.
- Store provider-agnostic canonical attendance in SQL:
  - `source = 'Webex'`
  - session date/name fields
  - normalized participant records
  - unmatched status
- Raw Webex metadata rows do not need SQL storage for the demo unless audit requirements demand it.

### LocalStorage dependencies by business area

| Business area | Current localStorage dependency | Move to Azure SQL or remain local? |
|---|---|---|
| Batches | Stored as full objects in `mavericks_phase2_batches` | Move to Azure SQL `batches`. |
| Participants | Nested inside each batch in `mavericks_phase2_batches` | Move to Azure SQL `participants`. |
| Attendance sessions | Per-batch/provider key, such as `mavericks_teams_attendance_${batchId}` | Move to Azure SQL `attendance_sessions` and `attendance_records`. |
| Attendance summary | Calculated in browser from local attendance and participants | Store cached summary in Azure SQL `attendance_summary`; recompute backend-side when source records change. |
| Assessments | Nested inside each batch in `mavericks_phase2_batches` | Move to Azure SQL `assessments` and `assessment_results`. |
| Feedback | Nested inside each batch in `mavericks_phase2_batches` | Move to Azure SQL `feedback` and `feedback_responses`. |
| Notifications | Stored as logs in `mavericks_execution_logs`, category often `alert` | Move to Azure SQL `notifications`. |
| Audit logs | Stored in `mavericks_execution_logs`, category often `audit` | Move to Azure SQL `audit_logs`. |
| Reports | Not stored; generated/downloaded in browser | Remain frontend-generated for demo. Store only export audit event if needed. |
| Local UI state | React state only, not localStorage | Remain frontend. |
| User role | Path/role selector only, not localStorage | Replace with auth later; no need for SQL table in first demo. |

---

## 3. Mock Data Dependency Audit

### Mock data files and exported objects

| File | Export | Current purpose | Azure replacement |
|---|---|---|---|
| `src/data/mockData.js` | `lifecycleStatuses` | Status options for batch lifecycle | Keep as frontend enum/config or mirror in backend validation. |
| `src/data/mockData.js` | `trainingTypes` | Training type dropdown options | Keep as frontend enum/config; backend should validate allowed values. |
| `src/data/mockData.js` | `batchTimelineSteps` | Initializes timeline state and displays lifecycle | Prefer derived lifecycle from real SQL records; keep labels frontend-side. |
| `src/data/mockData.js` | `mockBatches` | Seed batch registry, participant rosters, assessments, feedback, health snapshots, timelines | Replace with rows in Azure SQL. |
| `src/data/mockData.js` | `mockLogs` | Seed notification/audit panel | Replace with rows in Azure SQL `notifications` and `audit_logs`. |

### Mock data usage by file

| File | Mock dependency | Impact |
|---|---|---|
| `src/App.jsx` | Imports `mockBatches` and `mockLogs` | Main fallback data source. Without it and without SQL/API, the app starts mostly empty. |
| `src/App.jsx` | `enrichBatchDefaults()` uses matching `mockBatches` records to fill missing `assessments`, `feedback`, `healthSnapshot`, `discontinuedParticipantIds`, and `timeline` | Existing locally saved batches may silently inherit demo defaults. This should be removed after SQL migration. |
| `src/App.jsx` | `mergeDemoLogs()` merges saved logs with `mockLogs` | Demo logs reappear even after partial local changes. Production should never merge demo events into real audit history. |
| `src/components/BatchManagement.jsx` | Imports `batchTimelineSteps`, `lifecycleStatuses`, and `trainingTypes` | Form options and timeline initialization depend on mockData constants. These constants are config-like and can remain frontend-side for the demo. |

### Hardcoded demo data outside `mockData.js`

`src/App.jsx` also contains significant hardcoded demo content:

- Role definitions for admin, coordinator, trainer, and participant.
- Dashboard labels, metrics, trends, focus items, pipeline values, and activity messages.
- Simulated trainer identity: `Avery Shah`.
- Simulated participant identity: `neha.rao@example.com`.
- Role visibility rules for trainer and participant.

These are not localStorage dependencies, but they are frontend-only demo dependencies. They should be replaced by authentication/claims and SQL-backed dashboard metrics later.

### Screens dependent on seeded data

| Screen/flow | Dependency on seeded data | What happens if mock data is removed |
|---|---|---|
| Role selector | Uses hardcoded role definitions, not `mockData.js` | Still works. |
| Dashboard page | Uses hardcoded role metrics and batch-derived portfolio stats | Role cards still show hardcoded metrics, but batch health and portfolio stats become empty/zero without batches. |
| Batch registry | Uses `mockBatches` fallback | Empty table unless user creates local batches or SQL/API provides data. |
| Batch detail page | Uses selected batch from local/mock state | Cannot open demo batch routes unless batches exist. |
| Participant management | Uses participant arrays from `mockBatches` or locally created batches | Demo participant roster disappears. |
| Trainer view | Filters batches by simulated trainer name | Likely falls back to first available batch; with no batches, view is empty. |
| Participant view | Filters batches by simulated participant email | Likely falls back to first available batch; with no batches, view is empty. |
| Attendance upload | Needs a batch and participants | Upload flow is blocked until participants exist. |
| Attendance health display | Uses `healthSnapshot` in mock batches when no live attendance report exists | Health badges become default/empty until real attendance is uploaded. |
| Assessment module | Mock batches include seeded assessments/results | Demo assessment results and topper vanish. |
| Feedback module | Mock batches include feedback trigger/responses/summary | Demo feedback summary and responses vanish. |
| Reports module | Exports from current batch data | Exports still work but mostly produce empty/no-data reports. |
| Logs panel | Uses `mockLogs` plus locally generated logs | Notification center and audit trail start empty. |

### Demo flows that will break or lose value if `mockData` is removed

1. "Open app and immediately show enterprise-looking batch registry."
   - Breaks because batch rows come from `mockBatches`.

2. "Show internal and external/Segue batch examples."
   - Breaks because training examples are seeded in `mockBatches`.

3. "Show role-specific visibility."
   - Degrades because trainer/participant role filters depend on specific demo trainer/participant identities matching seeded batches.

4. "Show assessment clearance, not cleared candidates, and topper."
   - Breaks because seeded assessment result rows are in `mockBatches`.

5. "Show feedback summary."
   - Breaks because seeded feedback records are in `mockBatches`.

6. "Show notification center with realistic alerts."
   - Breaks because seeded alerts are in `mockLogs`.

7. "Show batch lifecycle already partially completed."
   - Degrades because timeline and health snapshots come from seeded batches.

8. "Show batch health without uploading attendance during the demo."
   - Degrades because `healthSnapshot` supplies current health when no uploaded attendance is in localStorage.

### What should become real Azure SQL data

Move these seeded/demo objects into SQL seed data for the demo:

- 3 to 5 demo batches.
- 2 to 5 participants per batch.
- 1 assessment per batch for at least two batches.
- Assessment result rows for at least one internal and one external/Segue batch.
- Feedback trigger and feedback response rows.
- A few notification and audit rows.
- Attendance summary snapshots for demo batches if live upload is not performed during judging.

Keep these as frontend config for the first migration:

- `lifecycleStatuses`
- `trainingTypes`
- `batchTimelineSteps`
- Role labels/icons/navigation metadata

---

## 4. Frontend-only Business Logic

### Business logic classification

| Logic | Current file(s) | Current behavior | Recommendation | Reason |
|---|---|---|---|---|
| Teams CSV parsing | `src/utils/attendanceEngine.js`, `src/utils/teamsParser.js` | PapaParse reads local CSV files; parser normalizes many possible Teams column names; extracts date from filename; filters by minimum stay. | HYBRID | Keep file parsing in frontend for low-cost demo speed, but persist canonical parsed sessions to backend and run backend validation before saving. |
| Webex CSV parsing | `src/utils/attendanceEngine.js`, `src/utils/webexParser.js` | PapaParse reads CSV files; validates Webex columns; ignores breakout sessions; aggregates duplicate attendees; extracts meeting metadata/date. | HYBRID | Keep browser parsing for direct upload UX; backend should store canonical sessions and optionally revalidate. |
| Minimum duration filtering | `src/components/uploads/TeamsAttendanceUpload.jsx`, `src/utils/teamsParser.js` | User selects minimum stay; parser filters attendees below threshold. | HYBRID | UI can keep the control; backend should store the chosen threshold and apply the official filter when calculating summaries. |
| Roster identity matching | `src/utils/attendanceEngine.js`, `src/utils/assessmentEngine.js`, `src/utils/feedbackEngine.js` | Matches by employee ID, email, or name. | MOVE BACKEND for official records; keep frontend preview | Matching affects risk, unmatched records, assessment mapping, feedback mapping, and auditability. |
| Attendance report preparation | `src/utils/attendanceEngine.js` | Builds dates, rows, unmatched records, summary, and rule-based "AI" summary. | HYBRID | Backend should own canonical summary; frontend can compute instant preview before save. |
| Risk engine | `src/utils/attendanceEngine.js` | HIGH if assessment not cleared, attendance below 50%, or absences >= 3; MEDIUM if attendance below 75%, two absences, pending assessment, or score near cutoff; LOW otherwise. | MOVE BACKEND | Risk is enterprise decision logic and should be consistent across users and sessions. |
| Recommended action | `src/utils/attendanceEngine.js` | Maps risk level to fixed action text. | MOVE BACKEND | Should align with official risk policy and alerts. Frontend can display returned text. |
| Batch health calculation | `src/utils/attendanceEngine.js` | Uses high/medium risk counts, participant count, and assessment clearance. | MOVE BACKEND | Health drives dashboards/lifecycle; should be computed from SQL facts. |
| Batch lifecycle calculation | `src/utils/attendanceEngine.js` | Derives lifecycle status from timeline, attendance, assessment, feedback, topper, and closed status. | HYBRID | Backend should provide authoritative milestone state; frontend can render it. |
| AI summary generation | `src/utils/attendanceEngine.js`, `src/utils/feedbackEngine.js` | Not actual AI. Deterministic summary strings are labeled "AI Summary" and "AI Feedback Summary". | MOVE BACKEND when Azure OpenAI is added | Best first Azure OpenAI feature. Keep deterministic fallback for cost control and resilience. |
| Topper logic | `src/utils/assessmentEngine.js` | Calculates weighted score by participant and sorts descending. | HYBRID | Backend should compute official topper after score upload; frontend can render and export. |
| Assessment CSV template generation | `src/utils/assessmentEngine.js` | Builds CSV template from participant roster and downloads it with Blob URL. | KEEP FRONTEND | Low-risk, low-cost, user-initiated file generation. |
| Assessment upload validation | `src/utils/assessmentEngine.js` | Validates CSV extension, columns, duplicate candidates, score range, and roster match. | HYBRID | Keep frontend validation for user feedback; backend must revalidate before save. |
| Assessment stats | `src/utils/assessmentEngine.js` | Calculates assessed, cleared, not cleared, remaining, clearance rate. | MOVE BACKEND for dashboards; keep frontend display fallback | Stats should be queryable and consistent. |
| Feedback CSV parsing | `src/utils/feedbackEngine.js` | Validates feedback CSV and maps responses to participants. | HYBRID | Keep browser parsing for demo; backend should store mapped responses and unmatched records. |
| Feedback summary | `src/utils/feedbackEngine.js` | Calculates average rating, comment count, and unmatched count. | MOVE BACKEND or Azure OpenAI summary later | Numeric stats can be backend; qualitative insight can use Azure OpenAI. |
| Notification creation | `src/utils/notificationEngine.js` | Creates local log/alert objects. No actual send. | MOVE BACKEND | Notification state, recipients, and statuses must be durable and auditable. |
| Audit log creation | `src/utils/notificationEngine.js`, `src/App.jsx` | Creates local logs and caps list at 200. | MOVE BACKEND | Audit trails must be immutable and not browser-local. |
| Report generation | `src/utils/attendanceExport.js` | Uses ExcelJS, Blob, and URL APIs to download reports. | KEEP FRONTEND for demo | Avoids backend file generation cost. SQL/API supplies report data; browser exports it. |
| Dashboard portfolio stats | `src/App.jsx` | Calculates from current local batches. | MOVE BACKEND eventually | Dashboards should query SQL-backed metrics. For demo, frontend can compute from fetched records. |
| Role-based access simulation | `src/App.jsx` | Role chosen by URL; filters by simulated trainer/participant identity. | MOVE BACKEND/AUTH | Replace with Microsoft Entra ID or simple demo login after core SQL migration. |
| Form validation | React components | HTML `required`, input types, basic numbers | KEEP FRONTEND plus backend validation | Frontend validation improves UX; backend validation protects data. |

### Detailed notes on named logic

#### Teams parsing

Current behavior:

- Accepts CSV files in the browser.
- Requires name, email, and duration-like columns.
- Supports many Teams column variants.
- Extracts date from filenames matching an attendance report naming pattern.
- Converts durations to minutes.
- Keeps raw row data inside normalized attendee objects.

Recommendation: HYBRID.

- Keep CSV parsing in frontend for the designathon demo because it costs nothing and is fast.
- Send parsed canonical JSON to backend.
- Backend endpoint should validate required fields and save canonical sessions.
- Do not move raw CSV ingestion to a heavy backend pipeline yet.

#### Webex parsing

Current behavior:

- Accepts CSV files in the browser.
- Requires Display Name, Attendee Email, and Attendance Duration.
- Ignores rows where Session Name includes breakout.
- Aggregates duplicate attendees.
- Extracts meeting name and meeting start date.

Recommendation: HYBRID.

- Same as Teams: keep parsing for UX, but persist validated canonical data in SQL.

#### Risk engine

Current behavior:

- Runs in `src/utils/attendanceEngine.js`.
- Mixes attendance and assessment signals.
- Produces `riskLevel`, `riskReason`, and `recommendedAction`.

Recommendation: MOVE BACKEND.

- This is core business logic.
- It must be consistent across users and cannot depend on one browser's localStorage.
- Store risk outputs in `attendance_summary` or calculate them on read from SQL.

#### AI summary generation

Current behavior:

- `generateBatchSummary(summary)` creates deterministic text.
- `generateFeedbackSummary(responses)` creates deterministic text.
- UI labels these as AI, but no model is called.

Recommendation: MOVE BACKEND, with deterministic fallback.

- Use Azure OpenAI only for summary/insight generation.
- Keep a non-AI fallback if the model is unavailable or budget is exhausted.
- Do not build a chatbot.

#### Topper logic

Current behavior:

- Weighted average is calculated from uploaded assessment results.
- Results are sorted by final score.

Recommendation: HYBRID.

- Backend should compute and persist official topper/score ranking.
- Frontend can keep the calculation for instant display and export fallback.

#### Report generation

Current behavior:

- Browser generates Excel files.
- No report is stored in localStorage.
- Export action creates a log entry.

Recommendation: KEEP FRONTEND for the demo.

- Backend should supply canonical report data.
- Browser can still generate `.xlsx` to avoid storage and compute costs.

#### Validation

Current behavior:

- Mostly frontend validation:
  - Required form fields.
  - CSV extension checks.
  - Required CSV columns.
  - Assessment score range.
  - Duplicate score upload prevention.
  - Duplicate attendance date detection.

Recommendation: HYBRID.

- Keep frontend validation for user experience.
- Add backend validation for all writes.

---

## 5. Azure SQL Migration Plan

### Design principles

- Keep schema simple enough for a designathon.
- Normalize the data that is currently deeply nested in localStorage.
- Avoid extra services unless they directly improve the demo.
- Prefer canonical records over storing raw CSV blobs.
- Allow browser-generated reports to query clean SQL-backed data.
- Keep one logical SQL database.

### Recommended core tables

The user-requested tables are included below. A few small child tables are recommended where one-to-many data would otherwise be awkward or lossy.

### Table: `batches`

Purpose:

- Replaces batch-level fields inside `mavericks_phase2_batches`.
- Provides the parent record for participants, attendance, assessments, feedback, notifications, and logs.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Internal primary key. |
| `batch_code` | nvarchar(50), unique | Current `batchId`, such as `MB-IN-2401`. |
| `training_name` | nvarchar(200) | Current `trainingName`. |
| `training_type` | nvarchar(30) | `Internal`, `External`, `Segue`. |
| `start_date` | date | Current `startDate`. |
| `end_date` | date | Current `endDate`. |
| `timings` | nvarchar(100) | Current free-text timings. |
| `status` | nvarchar(30) | `Planned`, `Running`, `Completed`, `Closed`. |
| `trainer_name` | nvarchar(150) | Keep denormalized for demo simplicity. |
| `trainer_email` | nvarchar(255) | Useful for role mapping later. |
| `trainer_phone` | nvarchar(50) | Current trainer phone. |
| `trainer_specialization` | nvarchar(150) | Current specialization. |
| `coordinator_spoc` | nvarchar(150) | Current `coordinatorSpoc`. |
| `meeting_link` | nvarchar(1000) | Current `meetingLink`. |
| `created_at` | datetime2 | Backend-generated. |
| `updated_at` | datetime2 | Backend-generated. |
| `created_by` | nvarchar(255), nullable | Later from auth. |
| `updated_by` | nvarchar(255), nullable | Later from auth. |

Relationships:

- One batch has many participants.
- One batch has many attendance sessions.
- One batch has many assessments.
- One batch has one or more feedback cycles.
- One batch has many notifications and audit logs.

Why needed:

- It is the anchor for nearly every current workflow.
- It converts the largest localStorage dependency into durable shared data.

### Table: `participants`

Purpose:

- Replaces nested `participants` arrays inside batch objects.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id` | Parent batch. |
| `participant_code` | nvarchar(50), nullable | Current participant `id`, `empId`, or external ID. |
| `emp_id` | nvarchar(50), nullable | Internal participants. |
| `name` | nvarchar(200) | Use one normalized field for internal/external names. |
| `email` | nvarchar(255), nullable | Internal `officialEmail` or external `email`. |
| `mobile_number` | nvarchar(50), nullable | External participants. |
| `participant_type` | nvarchar(30) | `Internal` or `External`. |
| `status` | nvarchar(30) | `Active`, `Discontinued`, `Removed`. |
| `created_at` | datetime2 | Backend-generated. |
| `updated_at` | datetime2 | Backend-generated. |

Relationships:

- Many participants belong to one batch.
- Attendance records, assessment results, and feedback responses can reference participants.

Why needed:

- Participant roster is required for attendance matching, assessment uploads, feedback matching, reports, and role-specific participant views.

### Table: `attendance_sessions`

Purpose:

- Stores one uploaded attendance session per batch/date/source.
- Replaces per-batch localStorage session arrays.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id` | Parent batch. |
| `source` | nvarchar(30) | `Teams` or `Webex`. |
| `training_name` | nvarchar(200), nullable | Name extracted from file/session. |
| `session_date` | date | Normalized attendance date. |
| `minimum_duration_minutes` | int | User-selected threshold used during upload. |
| `uploaded_file_name` | nvarchar(255), nullable | File name for audit. |
| `uploaded_by` | nvarchar(255), nullable | Later from auth. |
| `uploaded_at` | datetime2 | Backend-generated. |
| `record_count` | int | Count of saved attendance records. |
| `unmatched_count` | int | Count of records not matched to roster. |

Relationships:

- One batch has many attendance sessions.
- One attendance session has many attendance records.

Why needed:

- Attendance is currently saved separately from batches and is not durable across users. This table makes uploaded sessions durable, queryable, and auditable.

### Recommended child table: `attendance_records`

This table is not in the original requested list, but it is necessary to avoid storing all attendance details as JSON.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `attendance_session_id` | FK to `attendance_sessions.id` | Parent session. |
| `participant_id` | FK to `participants.id`, nullable | Null when unmatched. |
| `emp_id` | nvarchar(50), nullable | Uploaded/normalized employee ID. |
| `name` | nvarchar(200), nullable | Uploaded/normalized name. |
| `email` | nvarchar(255), nullable | Uploaded/normalized email. |
| `duration_minutes` | int | Normalized duration. |
| `first_join` | nvarchar(100), nullable | Teams field if available. |
| `last_leave` | nvarchar(100), nullable | Teams field if available. |
| `role` | nvarchar(100), nullable | Teams field if available. |
| `matched` | bit | Whether this row matched a roster participant. |
| `match_method` | nvarchar(30), nullable | `emp_id`, `email`, `name`, or null. |
| `created_at` | datetime2 | Backend-generated. |

Why needed:

- `attendance_sessions` alone cannot represent attendee-level rows, unmatched attendees, or duration totals.

### Table: `attendance_summary`

Purpose:

- Stores computed summary per batch after attendance upload/recalculation.
- Supports dashboards without recalculating every row in the browser.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id`, unique or versioned | Parent batch. |
| `total_sessions` | int | Count of attendance sessions. |
| `total_participants` | int | Roster size at calculation time. |
| `attended_count` | int | Participants with at least one present session. |
| `not_attended_count` | int | Participants with zero present sessions. |
| `high_risk_count` | int | Risk output. |
| `medium_risk_count` | int | Risk output. |
| `low_risk_count` | int | Risk output. |
| `not_cleared_count` | int | Assessment signal. |
| `pending_assessment_count` | int | Assessment signal. |
| `unmatched_count` | int | Unmatched attendance records. |
| `summary_text` | nvarchar(max), nullable | Deterministic or Azure OpenAI generated summary. |
| `summary_source` | nvarchar(30) | `rules` or `azure_openai`. |
| `calculated_at` | datetime2 | Backend-generated. |

Relationships:

- One summary belongs to one batch.
- Summary can be refreshed after attendance, assessment, or feedback changes.

Why needed:

- This replaces browser-only risk/summary as the authoritative output for dashboards and reports.

### Table: `assessments`

Purpose:

- Stores assessment setup currently nested inside batches.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id` | Parent batch. |
| `assessment_code` | nvarchar(50), nullable | Current assessment `id`. |
| `name` | nvarchar(200) | Assessment name. |
| `type` | nvarchar(50) | `Sprint`, `Coding/API`, `Project`. |
| `assessment_date` | date, nullable | Current `date`. |
| `cutoff_score` | decimal(5,2) | Current `cutoffScore`. |
| `max_score` | decimal(8,2) | Current `maxScore`. |
| `weightage` | decimal(5,2) | Current `weightage`. |
| `uploaded_file_name` | nvarchar(255), nullable | Last score upload file. |
| `uploaded_at` | datetime2, nullable | Upload time. |
| `created_at` | datetime2 | Backend-generated. |
| `created_by` | nvarchar(255), nullable | Later from auth. |

Relationships:

- One batch has many assessments.
- One assessment has many assessment results.

Why needed:

- Assessment configuration is business data and should be shared across users.

### Recommended child table: `assessment_results`

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `assessment_id` | FK to `assessments.id` | Parent assessment. |
| `participant_id` | FK to `participants.id` | Mapped participant. |
| `score_percent` | decimal(5,2) | Uploaded score percent. |
| `comments` | nvarchar(max), nullable | Uploaded comments. |
| `cleared` | bit | Based on cutoff. |
| `uploaded_at` | datetime2 | Backend-generated. |

Why needed:

- Keeps assessment setup and participant results normalized.
- Supports topper and clearance calculations.

### Table: `feedback`

Purpose:

- Stores feedback trigger/upload state currently nested inside batch objects.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id` | Parent batch. |
| `triggered_at` | datetime2, nullable | Current `feedback.triggeredAt`. |
| `triggered_by` | nvarchar(255), nullable | Later from auth. |
| `uploaded_at` | datetime2, nullable | Current `feedback.uploadedAt`. |
| `uploaded_file_name` | nvarchar(255), nullable | Current `feedback.uploadedFileName`. |
| `summary_text` | nvarchar(max), nullable | Feedback summary. |
| `summary_source` | nvarchar(30) | `rules` or `azure_openai`. |
| `created_at` | datetime2 | Backend-generated. |
| `updated_at` | datetime2 | Backend-generated. |

Relationships:

- One batch can have one feedback cycle for demo simplicity.
- One feedback record has many feedback responses.

Why needed:

- Feedback trigger state, response count, and summary should be durable and shared.

### Recommended child table: `feedback_responses`

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `feedback_id` | FK to `feedback.id` | Parent feedback cycle. |
| `participant_id` | FK to `participants.id`, nullable | Null if unmatched. |
| `emp_id` | nvarchar(50), nullable | Uploaded/matched identity. |
| `name` | nvarchar(200), nullable | Uploaded/matched identity. |
| `email` | nvarchar(255), nullable | Uploaded/matched identity. |
| `rating` | decimal(3,2), nullable | 0 to 5. |
| `comments` | nvarchar(max), nullable | Free text. |
| `matched` | bit | Whether matched to roster. |
| `uploaded_at` | datetime2 | Backend-generated. |

Why needed:

- Avoids storing response arrays as JSON inside a batch row.

### Table: `notifications`

Purpose:

- Stores alert/reminder records currently mixed into `mavericks_execution_logs`.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or int identity | Primary key. |
| `batch_id` | FK to `batches.id`, nullable | Some notifications may be global later. |
| `action` | nvarchar(100) | Current action, such as `attendance_missing`. |
| `type` | nvarchar(50) | Attendance, Assessment, Feedback, Absence, Report. |
| `level` | nvarchar(30) | INFO, WARNING, HIGH. |
| `recipient` | nvarchar(255) | Display recipient for demo. |
| `status` | nvarchar(50) | Open, Sent, Scheduled, Completed. |
| `message` | nvarchar(max) | Notification text. |
| `created_at` | datetime2 | Backend-generated. |
| `created_by` | nvarchar(255), nullable | Later from auth/system. |
| `resolved_at` | datetime2, nullable | For alerts that are closed. |

Relationships:

- Many notifications can belong to one batch.

Why needed:

- Alerts/reminders need durable status and should not disappear with browser storage.

### Table: `audit_logs`

Purpose:

- Stores immutable audit records currently mixed with notifications in localStorage.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uniqueidentifier or bigint identity | Primary key. |
| `batch_id` | FK to `batches.id`, nullable | Parent batch if applicable. |
| `action` | nvarchar(100) | `batch_created`, `participant_added`, `assessment_upload`, etc. |
| `entity_type` | nvarchar(50) | Batch, Participant, Attendance, Assessment, Feedback, Report. |
| `entity_id` | nvarchar(100), nullable | Related entity identifier. |
| `level` | nvarchar(30) | INFO, WARNING, HIGH. |
| `message` | nvarchar(max) | Human-readable log. |
| `actor` | nvarchar(255), nullable | Later from auth. |
| `created_at` | datetime2 | Backend-generated. |
| `metadata_json` | nvarchar(max), nullable | Optional compact JSON for file name/count/source. |

Relationships:

- Many audit logs can belong to one batch.

Why needed:

- Audit records should not be editable by the browser and should survive across sessions and users.

### Minimal API endpoints for demo migration

These are enough for the designathon without overengineering:

| Endpoint | Purpose |
|---|---|
| `GET /api/batches` | Load batch registry with summary fields. |
| `GET /api/batches/{batchCode}` | Load batch details, participants, assessments, feedback, summaries, logs. |
| `POST /api/batches` | Create batch. |
| `PUT /api/batches/{batchCode}` | Edit batch. |
| `POST /api/batches/{batchCode}/participants` | Add participant. |
| `DELETE /api/batches/{batchCode}/participants/{participantId}` | Mark participant removed/discontinued. |
| `POST /api/batches/{batchCode}/attendance-sessions` | Save parsed attendance session records. |
| `POST /api/batches/{batchCode}/assessments` | Create assessment setup. |
| `POST /api/assessments/{assessmentId}/results` | Save validated score rows. |
| `POST /api/batches/{batchCode}/feedback/trigger` | Record feedback trigger and notification. |
| `POST /api/batches/{batchCode}/feedback/responses` | Save feedback responses and summary. |
| `GET /api/batches/{batchCode}/reports/summary-data` | Return canonical report data for browser Excel export. |

---

## 6. Azure OpenAI Usage Plan

### Best AI feature to implement first

Implement batch insight summary generation, not a chatbot.

Best first feature:

- "Execution Insight Summary" for a batch after attendance, assessment, and feedback data are saved.

It should generate:

- 3 to 5 bullet insights.
- Top risks.
- Suggested coordinator action.
- Trainer follow-up recommendation.
- One concise executive summary sentence.

Why this is the best feature:

- The UI already has "AI Summary" and "AI Feedback Summary" placeholders.
- It gives visible demo value without changing the whole app.
- It uses small structured inputs, not full CSV files.
- It avoids chat state, retrieval systems, vector databases, and extra Azure services.
- It can be cached in SQL and regenerated only when source data changes.

### Recommended model posture

Use a low-cost Azure OpenAI model such as `gpt-4.1-nano` if available in the chosen region/subscription. Microsoft documentation lists `gpt-4.1-nano` as part of the GPT-4.1 series and available across many Azure regions. Exact model pricing should be checked in the Azure pricing calculator or Azure portal for the active subscription before the demo.

Avoid:

- Provisioned throughput.
- Chatbot architecture.
- Vector search.
- Document ingestion.
- Long prompt history.
- Per-row AI calls.
- AI for CSV parsing.

### Expected prompt size

Use compact JSON, not raw files.

Typical prompt input:

```json
{
  "batch": {
    "batchCode": "MB-IN-2401",
    "trainingName": "Execution Excellence Foundations",
    "trainingType": "Internal",
    "status": "Running",
    "participantCount": 32
  },
  "attendance": {
    "sessions": 3,
    "attended": 28,
    "notAttended": 4,
    "highRisk": 3,
    "mediumRisk": 7,
    "unmatched": 2
  },
  "assessment": {
    "assessed": 29,
    "cleared": 24,
    "notCleared": 5,
    "pending": 3,
    "clearanceRate": 75
  },
  "feedback": {
    "responseCount": 18,
    "averageRating": 4.2,
    "commentThemes": ["more hands-on practice", "pace was good"]
  }
}
```

Estimated size:

- Input: 600 to 1,500 tokens per batch.
- Output: 150 to 300 tokens per summary.
- Demo volume: 10 to 50 summary generations.

### Low-cost usage strategy

1. Generate only on explicit user action or after upload completion, not on every render.
2. Cache generated text in `attendance_summary.summary_text` or `feedback.summary_text`.
3. Store `summary_source = 'azure_openai'` and `calculated_at`.
4. Reuse cached summary until source data changes.
5. Keep deterministic rule-based fallback.
6. Limit output to 200 to 300 words.
7. Set a monthly Azure budget alert well below the credit amount.
8. For the demo, pre-generate summaries for seeded SQL data and avoid repeated calls during judging.

### Safe prompt instructions

The backend prompt should:

- Ask for concise operational insights only.
- Forbid invented counts or unsupported claims.
- Require all numbers to come from provided JSON.
- Ask for no personal judgement about participants.
- Use "candidate" or "participant" language neutrally.
- Avoid medical, legal, financial, or employment termination recommendations.

Example system behavior:

- "Use only the supplied batch metrics. Do not invent names, counts, dates, or causes. Return concise enterprise training execution insights."

### What not to use AI for

Do not use Azure OpenAI for:

- Chatbot workflows.
- Authentication.
- SQL query generation at runtime.
- CSV parsing.
- Per-attendee risk classification.
- Report file generation.
- Notification delivery.
- Large raw attendance files.

---

## 7. What Must Stay Frontend

### CSV parsing

Recommendation: KEEP FRONTEND for initial parsing and preview.

Why:

- Users already upload local CSV files through file inputs.
- PapaParse works well in the browser for small designathon/demo files.
- It avoids backend file upload handling, storage, malware scanning, and Blob Storage setup.
- It keeps Azure cost lower.

Important caveat:

- Backend must still validate parsed records before saving to SQL.
- The frontend can parse and preview; the backend owns final persistence.

### Report export

Recommendation: KEEP FRONTEND.

Why:

- `src/utils/attendanceExport.js` already generates Excel files in the browser.
- Browser-side export avoids backend report rendering services.
- It avoids storing generated files.
- It keeps the demo simple and cheap.

Backend role:

- Provide clean report data from SQL.
- Record export audit events.

### Local UI state

Recommendation: KEEP FRONTEND.

Examples:

- Open/closed form state.
- Current role selection before auth is added.
- Current route/path.
- File input selected state.
- Upload progress message.
- Minimum stay dropdown selection before upload.
- Temporary form values.
- Button disabled states.
- Table scroll position.

Why:

- These are not enterprise records.
- Persisting them in SQL adds no demo value.
- Browser state is the correct place for transient UI behavior.

### Visual analytics

Recommendation: KEEP FRONTEND rendering.

Examples:

- Dashboard cards.
- Status badges.
- Health badges.
- Progress rows.
- Summary cards.
- Tables.
- Charts if added later.

Why:

- SQL/backend should provide facts and calculated metrics.
- React should render visuals.
- Moving visual rendering backend-side would add complexity without helping the demo.

### Frontend validation

Recommendation: KEEP FRONTEND, but duplicate important validation backend-side.

Why:

- Frontend validation gives immediate user feedback.
- Backend validation protects data integrity.
- This hybrid approach is standard and demo-safe.

### File downloads

Recommendation: KEEP FRONTEND.

Current browser APIs:

- `Blob`
- `URL.createObjectURL`
- `document.createElement('a')`
- dynamic `import('exceljs')`

Why:

- No need for Blob Storage or server-generated file endpoints for the designathon.

---

## 8. Cloud Migration Priority

### Step 1: Move batch registry and participants to Azure SQL

Goal:

- Replace `mavericks_phase2_batches` for core batch and participant data.

Work:

- Create Azure SQL database.
- Create `batches` and `participants` tables.
- Seed current `mockBatches` core fields and participants into SQL.
- Add a minimal backend API.
- Update frontend to load/save batches and participants through API.
- Keep localStorage fallback only for emergency demo mode.

Why first:

- Highest demo value.
- Lowest risk.
- Makes the app multi-user visible.
- Unlocks all later migration work.

### Step 2: Move audit logs and notifications to Azure SQL

Goal:

- Replace `mavericks_execution_logs`.

Work:

- Create `audit_logs` and `notifications`.
- Persist events currently produced by `createLogEntry()`.
- Persist alerts currently produced by `createAttendanceAlerts()`, `createAssessmentReminder()`, and `createFeedbackTrigger()`.
- Load logs for batch detail from SQL.

Why second:

- Strong enterprise-readiness signal.
- Small schema.
- Low Azure usage.
- Very visible in demo through Notification Center and Audit Trail.

### Step 3: Move assessments and feedback to Azure SQL

Goal:

- Remove nested assessment and feedback arrays from batch localStorage.

Work:

- Create `assessments`, `assessment_results`, `feedback`, and `feedback_responses`.
- Keep frontend CSV parsing.
- Send validated parsed rows to backend.
- Store assessment stats and feedback summary data.

Why third:

- Gives clear business value.
- Supports topper report and consolidated report from durable data.
- Avoids losing key demo flows when localStorage is cleared.

### Step 4: Move attendance sessions and summaries to Azure SQL

Goal:

- Replace per-batch provider attendance localStorage keys.

Work:

- Create `attendance_sessions`, `attendance_records`, and `attendance_summary`.
- Keep Teams/Webex parsing in frontend.
- POST parsed canonical records to backend.
- Backend calculates official summary/risk/unmatched counts.
- Frontend reads summary and report rows from API.

Why fourth:

- Attendance is the most complex part.
- Doing it after batches/participants/logs reduces migration risk.
- It delivers strong demo value once core entities are stable.

### Step 5: Add Azure OpenAI summary generation

Goal:

- Replace rule-only "AI Summary" with real low-cost AI-generated insight.

Work:

- Add one backend endpoint: `POST /api/batches/{batchCode}/generate-insight`.
- Send compact summary JSON only.
- Store generated summary in SQL.
- Keep rule-based fallback.

Why fifth:

- AI is impressive for the demo but should not block core data migration.
- It has controlled cost if cached.

### Step 6: Add simple authentication

Goal:

- Replace simulated role picker with enterprise-friendly access.

Work:

- For demo: simple role login or Microsoft Entra ID if time allows.
- Map user email to role and trainer/participant visibility.

Why last:

- Useful, but authentication can consume time.
- The biggest scoring value likely comes from durable data plus AI insight.

---

## 9. Azure Cost Optimization

### Cheapest Azure setup for the demo

Recommended setup:

| Need | Recommended Azure service | Cost posture |
|---|---|---|
| Frontend hosting | Azure Static Web Apps Free plan | Microsoft docs state Static Web Apps has Free and Standard plans. Use Free. |
| Database | Azure SQL Database free offer if subscription supports it | Microsoft docs list monthly free limits: 100,000 vCore seconds and up to 32 GB per database, up to 10 databases per subscription. |
| Backend API | Static Web Apps managed API/Azure Functions consumption, or a tiny App Service only if needed | Prefer consumption/free-friendly path. Avoid always-on paid compute. |
| AI | Azure OpenAI pay-as-you-go, low-cost model, no provisioned throughput | Use only cached summaries. |
| File storage | None for first demo | Keep report generation and CSV parsing frontend-side. |
| Monitoring | Azure built-in metrics + budget alerts | Avoid paid Application Insights ingestion unless needed. |

### Safest SQL tier

First choice:

- Azure SQL Database free offer with auto-pause until next month when free limits are exhausted.

Why:

- Fully managed SQL PaaS.
- Enough for designathon data volume.
- Low operational complexity.
- Microsoft documentation states the free offer includes monthly free limits and can auto-pause when limits are met.

Fallback if free offer is unavailable:

- Use the smallest practical Azure SQL serverless/basic option for the shortest demo window.
- Seed only small data.
- Delete or pause after demo.
- Set a hard budget alert.

Avoid:

- SQL Managed Instance.
- SQL Server on VM.
- Always-on high DTU/vCore tiers.
- Multiple databases.
- Long-term backup retention for demo.

### Safest OpenAI usage

Use:

- One low-cost deployment.
- Compact prompts.
- Manual "Generate insight" button.
- SQL caching.
- Max output limit around 300 tokens.
- No streaming requirement.
- No provisioned throughput.

Expected designathon usage:

- 10 to 50 calls.
- 600 to 1,500 input tokens each.
- 150 to 300 output tokens each.
- This should stay far below a $50 credit budget if using a low-cost model and avoiding repeated calls.

Cost guardrails:

1. Add an Azure budget at or below $40.
2. Add alerts at 50 percent, 75 percent, and 90 percent.
3. Pre-generate demo summaries.
4. Disable auto-generation on page load.
5. Keep deterministic fallback when budget or quota is reached.
6. Do not use GPT-5-class or high-cost reasoning models for this demo.
7. Do not send raw CSV files to the model.

### Services to avoid for this phase

Avoid these unless a judge explicitly requires them:

- Azure Kubernetes Service.
- Azure Container Apps.
- Azure Service Bus.
- Azure Data Factory.
- Azure Blob Storage.
- Azure AI Search/vector database.
- Cosmos DB.
- Redis Cache.
- Event Grid.
- Logic Apps.
- Power BI Embedded.
- SQL Managed Instance.
- Dedicated App Service Standard/Premium plan.
- Provisioned Azure OpenAI throughput.

### Expected budget posture under $50

Safest plan:

| Component | Expected usage | Budget posture |
|---|---|---|
| Static Web Apps Free | Host built Vite app | $0 if Free plan is used. |
| Azure SQL free offer | Small demo database, seeded rows, low query volume | Should fit within free monthly limits if available. |
| API compute | Low request volume | Use consumption/free-friendly hosting. |
| Azure OpenAI | 10 to 50 small summary calls | Keep under a few dollars with low-cost model and caching. Verify exact pricing in active Azure region/subscription. |
| Storage | None | $0 for first phase. |

Main cost risk:

- Accidentally selecting paid hosting tier or paid SQL configuration.
- Re-generating AI summaries on every render.
- Using a large/high-cost AI model.
- Leaving paid App Service plan running after demo.

---

## 10. Final Enterprise Architecture

### Recommended simple final architecture

Keep the architecture simple and demo-safe:

```text
React + Vite frontend
        |
        | HTTPS API calls
        v
Minimal backend API
        |
        | SQL queries
        v
Azure SQL Database

Backend API
        |
        | Small cached summary requests only
        v
Azure OpenAI
```

### Frontend

Recommended:

- React + Vite app.
- Host on Azure Static Web Apps Free plan.
- Continue using existing UI modules.
- Replace localStorage data reads/writes with API calls.
- Keep CSV parsing and report download in browser.
- Keep visual analytics rendering in React.

Frontend should own:

- Layout.
- Role navigation display.
- Forms.
- Upload UI.
- CSV parse preview.
- Tables/cards/charts.
- Excel export download.
- Local UI state.

Frontend should not own:

- Authoritative business data.
- Audit log persistence.
- Notification status.
- Official risk calculation.
- Official topper ranking.
- Official summary storage.

### Database

Recommended:

- Azure SQL Database.
- Start with one database.
- Use the free offer if available.
- Use normalized tables:
  - `batches`
  - `participants`
  - `attendance_sessions`
  - `attendance_records`
  - `attendance_summary`
  - `assessments`
  - `assessment_results`
  - `feedback`
  - `feedback_responses`
  - `notifications`
  - `audit_logs`

Database should own:

- Shared enterprise state.
- Relationships.
- Queryable reports.
- Durable audit history.
- Notification state.
- Cached summaries.

### AI

Recommended:

- Azure OpenAI for summary/insight generation only.
- No chatbot.
- No vector search.
- No raw CSV prompts.
- Generate only from compact aggregated metrics.
- Cache output in SQL.
- Keep deterministic summary fallback.

Best AI feature:

- Batch execution insight summary.

Secondary AI feature if time remains:

- Feedback theme summary from comments, but only after feedback responses are saved and only with strict prompt limits.

### Hosting

Recommended:

- Frontend: Azure Static Web Apps Free.
- API: Static Web Apps API/Azure Functions consumption where possible.
- Database: Azure SQL Database free offer or smallest safe SQL tier.

Avoid:

- Dedicated always-on compute for the designathon.
- Kubernetes.
- Complex microservices.

### Authentication

Recommended demo-safe path:

1. Short term:
   - Keep role selector for demo if time is tight.
   - Add a clear note that production maps roles through identity.

2. Enterprise-ready path:
   - Microsoft Entra ID.
   - User email/claim maps to role.
   - Trainer sees batches where `trainer_email` matches.
   - Participant sees batches where participant `email` matches.
   - Coordinator/admin see all allowed batches.

Do not build a custom complex auth system for the designathon.

### Reports

Recommended:

- SQL/API returns canonical report data.
- Browser generates Excel files using existing `attendanceExport.js`.
- Store report export events in `audit_logs`.
- Do not store generated reports unless explicitly required.

Report types:

- Attendance report.
- Assessment report.
- Topper report.
- Consolidated report.

### Notifications

Recommended:

- Store notification rows in SQL.
- Generate notifications in backend when relevant events occur:
  - Attendance missing.
  - Consecutive absence threshold reached.
  - Assessment reminder created.
  - Feedback triggered.
  - Report exported if useful.
- Display notifications in existing `LogsPanel`.
- For designathon, do not send emails/SMS/Teams messages. Store and display notification status only.

### Final target state by component

| Component/module | Final state |
|---|---|
| `App.jsx` | Fetches batches/logs from API instead of localStorage. Keeps navigation and layout. |
| `BatchManagement.jsx` | Calls API for create/update participants/batches. Keeps forms and UI. |
| `TeamsAttendanceUpload.jsx` | Parses CSV in browser, posts canonical sessions, reads summaries from API. |
| `AssessmentModule.jsx` | Keeps CSV template and upload UI, posts assessment setup/results to API. |
| `FeedbackModule.jsx` | Keeps upload UI, posts trigger/responses to API, displays stored summary. |
| `ReportsModule.jsx` | Fetches canonical report data if needed, continues browser Excel export. |
| `LogsPanel.jsx` | Displays SQL-backed notifications and audit logs. |
| `storage.js` | Remove from enterprise flows; optionally keep for UI preferences only. |
| `mockData.js` | Keep enums/config only; remove seeded enterprise data from runtime path. |

---

## Final Recommendation

The codebase is a strong designathon frontend, but it is currently not an enterprise data platform because the browser is acting as the database, business-rule engine, notification service, audit log, and report processor.

The safest winning migration is:

1. Move batches and participants to Azure SQL.
2. Move notifications and audit logs to Azure SQL.
3. Move assessments and feedback to Azure SQL.
4. Move attendance sessions and summaries to Azure SQL while keeping CSV parsing in the frontend.
5. Add one Azure OpenAI feature: cached execution insight summaries.
6. Keep frontend report export, visual analytics, CSV preview, and local UI state in the browser.

This gives the demo enterprise readiness without overbuilding, keeps Azure usage safely low, and makes the current "AI Summary" label real with a controlled, low-cost feature.
