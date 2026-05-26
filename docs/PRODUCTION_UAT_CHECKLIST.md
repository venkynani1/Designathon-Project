<!-- Documents architecture, operations, or decisions for the Mavericks Execution Platform. -->
# Production UAT Checklist

Use a non-production recipient group first. Configure backend-only `AZURE_COMMUNICATION_CONNECTION_STRING`,
`AZURE_EMAIL_FROM_ADDRESS`, `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`,
`AI_EMAIL_ENABLED=true`, and `AI_DECISION_ENABLED=true`. Never enter secrets in the UI.

## Email Verification

Open **Email Logs** as Admin or Coordinator. Select a saved batch and use the verification actions.

| Scenario | Intended recipients | Verification |
| --- | --- | --- |
| Attendance reminder | Assigned trainer email IDs in the batch | Preview recipients in batch lifecycle, send reminder, confirm Email Logs status/provider/AI origin |
| Missing attendance cutoff | Coordinator/SPOC email configured on the batch | Run Azure Function/scheduler after start-time grace period, confirm `attendance_not_uploaded_before_cutoff` |
| External low attendance | Participant email and placement officer email | Evaluate notifications for an External/Segue batch with low attendance |
| External low score | Participant email and placement officer email | Upload below-cutoff score for External/Segue participant |
| Feedback request | Uploaded eligible participants only | Preview selected recipients, trigger feedback, confirm only selected IDs appear in Email Logs |
| Assessment reminder | Participant email IDs in the batch | Use reminder action and confirm individual delivery logs |
| External onboarding pending | Participant email and placement officer email | Run onboarding scheduler for completed External/Segue batch |

Email Logs show event type, recipient, subject, Azure/mock provider, `openai`/`fallback` generation
origin, delivery status, timestamp, and provider error only. Secrets are never returned.

## Demo Workflow

1. Sign in through Demo Mode as **Admin** and add Coordinator and Trainer users.
2. Review **Trainings**, **Reports**, settings, topper criteria, and **Email Logs**.
3. Sign in as **Coordinator** and create an Internal/Mavericks batch with a Coordinator/SPOC email and assigned trainer email.
4. Upload the participant roster and preview recipients in the batch lifecycle.
5. Send the trainer attendance reminder and validate delivery in **Email Logs**.
6. Sign in as **Trainer**, open the assigned batch, and upload attendance.
7. Add assessment metadata as Coordinator or Trainer.
8. Download the score template and upload participant scores as Trainer.
9. Sign in as **Coordinator**, upload eligible feedback participants, and verify the recipient preview.
10. Trigger feedback and confirm only selected participants receive emails.
11. Sign in through a real Participant session or test token, open the generated feedback request, and submit all answers.
12. As Coordinator, review feedback/AI insight cards and download attendance, assessment, topper, and consolidated reports.
13. As Admin, confirm all trainings and downloadable reports remain visible.
14. Create an External/Segue batch with placement officer email, upload low attendance or a below-cutoff score, and verify participant plus placement-officer delivery logs.

## Release Gates

```powershell
npm test
npm run build
cd server; npm test; npx prisma validate
cd ../azure-functions; npm test
```
