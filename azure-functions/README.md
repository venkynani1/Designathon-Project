<!-- Documents architecture, operations, or decisions for the Mavericks Execution Platform. -->
# Mavericks Notification Scheduler Azure Functions

Node.js Azure Functions v4 timer triggers that call the backend notification scheduler endpoints.

## Functions and Schedules

Azure Timer Trigger cron schedules are UTC.

| Function | IST Time | UTC Schedule | Backend endpoint |
| --- | --- | --- | --- |
| `assessmentReminder` | 8:00 AM | `0 30 2 * * *` | `/api/notifications/run/assessment-reminders` |
| `onboardingReminder` | 9:00 AM | `0 30 3 * * *` | `/api/notifications/run/onboarding` |
| `attendanceCutoffReminder` | Every 5 minutes | `0 */5 * * * *` | `/api/notifications/run/attendance-cutoff` |
| `consecutiveAbsenceReminder` | 6:00 PM | `0 30 12 * * *` | `/api/notifications/run/consecutive-absence` |

## Environment Variables

- `API_BASE_URL`: Backend base URL, for example `https://your-api.azurewebsites.net`
- `SCHEDULER_SECRET`: Shared secret sent as `x-scheduler-secret`
- `AzureWebJobsStorage`: Required by Azure Functions runtime
- `FUNCTIONS_WORKER_RUNTIME`: `node`

Do not commit `local.settings.json`. Use `local.settings.json.example` as a template.

For production, set `SCHEDULER_SECRET` to the same value configured on the backend Azure App Service. Store it in Function App Configuration or Key Vault references, not in source files.

## Local Run

Install dependencies:

```bash
cd azure-functions
npm install
```

Create `local.settings.json` from the example and set real local values.

Run tests:

```bash
npm test
```

Start locally with Azure Functions Core Tools:

```bash
npm start
```

## Azure Deployment

1. Create or choose an Azure Function App running Node.js.
2. Configure app settings:
   - `API_BASE_URL`
   - `SCHEDULER_SECRET`
   - `AzureWebJobsStorage`
   - `FUNCTIONS_WORKER_RUNTIME=node`
3. Deploy the `azure-functions` folder with Azure Functions Core Tools:

```bash
func azure functionapp publish <function-app-name>
```

The secret is only sent as an HTTP header to the backend and is never logged.

## Backend Requirements

The backend must be deployed and reachable at `API_BASE_URL`. It must have:

- Supabase PostgreSQL configured through `DATABASE_URL`
- Azure Communication Services Email configured
- The same `SCHEDULER_SECRET` value as this Function App
- Scheduler endpoints available under `/api/notifications/run/*`
