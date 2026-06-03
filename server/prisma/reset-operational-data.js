// Safely clears operational demo/test data while preserving app configuration and users.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CONFIRMATION_VALUE = 'true'
const clearPlacementOfficerMappings =
  process.env.RESET_PLACEMENT_OFFICER_MAPPINGS === CONFIRMATION_VALUE

const preservedTables = [
  'User',
  'SystemSetting',
  'TrainerProfile',
  'Prisma migrations',
  'Environment configuration',
]

const defaultPreservedTables = [
  ...preservedTables,
  'PlacementOfficerMapping',
]

async function deleteAndRecord(label, delegate, results) {
  const result = await delegate.deleteMany()
  results.push({ label, count: result.count })
}

async function main() {
  if (process.env.CONFIRM_RESET !== CONFIRMATION_VALUE) {
    console.error('Operational data reset aborted.')
    console.error('Set CONFIRM_RESET=true to confirm this irreversible data cleanup.')
    process.exitCode = 1
    return
  }

  const results = []

  await prisma.$transaction(async (transaction) => {
    await deleteAndRecord('EmailLog', transaction.emailLog, results)
    await deleteAndRecord('Notification', transaction.notification, results)
    await deleteAndRecord('Log', transaction.log, results)
    await deleteAndRecord('AiInsight', transaction.aiInsight, results)

    await deleteAndRecord('FeedbackResponse', transaction.feedbackResponse, results)
    await deleteAndRecord('FeedbackRun', transaction.feedbackRun, results)

    await deleteAndRecord('AssessmentResult', transaction.assessmentResult, results)
    await deleteAndRecord('AssessmentEvidence', transaction.assessmentEvidence, results)
    await deleteAndRecord('Assessment', transaction.assessment, results)

    await deleteAndRecord('AttendanceRecord', transaction.attendanceRecord, results)
    await deleteAndRecord('AttendanceSession', transaction.attendanceSession, results)
    await deleteAndRecord('AttendanceVersion', transaction.attendanceVersion, results)
    await deleteAndRecord('AttendanceSummary', transaction.attendanceSummary, results)

    await deleteAndRecord('Participant', transaction.participant, results)
    await deleteAndRecord('Batch', transaction.batch, results)

    if (clearPlacementOfficerMappings) {
      await deleteAndRecord(
        'PlacementOfficerMapping',
        transaction.placementOfficerMapping,
        results,
      )
    }
  })

  const totalDeleted = results.reduce((total, item) => total + item.count, 0)

  console.log('Operational data reset completed.')
  console.log(`Total records deleted: ${totalDeleted}`)
  console.log('')
  console.log('Tables cleared:')
  for (const item of results) {
    console.log(`- ${item.label}: ${item.count}`)
  }
  console.log('')
  console.log('Tables preserved:')
  for (const label of clearPlacementOfficerMappings ? preservedTables : defaultPreservedTables) {
    console.log(`- ${label}`)
  }
  if (!clearPlacementOfficerMappings) {
    console.log('')
    console.log(
      'PlacementOfficerMapping was preserved. To clear demo/test mappings too, rerun with RESET_PLACEMENT_OFFICER_MAPPINGS=true.',
    )
  }
}

main()
  .catch((error) => {
    console.error('Operational data reset failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
