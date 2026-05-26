// Verifies the coordinatorBatchOperations.test client behavior and protects its user-facing contract.
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  BATCH_TEMPLATE_COLUMNS,
  EXTERNAL_PARTICIPANT_COLUMNS,
  INTERNAL_PARTICIPANT_COLUMNS,
  parseBatchTemplate,
  parseParticipantTemplate,
  validateBatchTemplateRow,
  validateParticipantTemplateRow,
} from './coordinatorBatchOperations'

async function workbookBlob(columns, row) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Template')
  worksheet.addRow(columns)
  worksheet.addRow(row)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer])
}

describe('coordinator batch operations', () => {
  it('validates batch template rows and maps coordinator fields', () => {
    const row = validateBatchTemplateRow({
      'Training Name': 'Execution Lab',
      'Start Date': '2026-05-20',
      'End Date': '2026-05-22',
      'Schedule Type': 'Custom Dates',
      'Custom Dates': '2026-05-20, 2026-05-22',
      Timings: '10:00 AM - 1:00 PM',
      'Trainer Type': 'Hexavarsity',
      'Trainer Name': 'Mira Thomas',
      'Trainer Email': '',
      'Trainer Emp ID': 'TR-100',
      'Trainer Unit/Competency': 'Customer Success',
      'Meeting Platform': 'Webex',
      'Batch Type': 'External/Segue',
    })

    expect(row.errors).toEqual([])
    expect(row.batch).toMatchObject({
      trainingName: 'Execution Lab',
      trainingType: 'Segue',
      scheduleType: 'Custom Dates',
      trainerType: 'Hexavarsity',
      trainerEmpId: 'TR-100',
      trainerUnitOrCompetency: 'Customer Success',
      meetingPlatform: 'Webex',
      batchType: 'External/Segue',
    })
  })

  it('reports row-level batch validation errors', () => {
    const row = validateBatchTemplateRow({
      'Training Name': '',
      'Start Date': 'bad-date',
      'End Date': '2026-05-22',
      'Schedule Type': 'Custom Dates',
      'Custom Dates': '',
      Timings: '',
      'Trainer Type': 'External',
      'Trainer Name': 'Avery Shah',
      'Trainer Email': '',
      'Meeting Platform': 'Zoom',
      'Batch Type': 'Partner',
    })

    expect(row.errors).toEqual(expect.arrayContaining([
      'Training Name is required.',
      'Start Date must use YYYY-MM-DD.',
      'Custom Dates is required for Custom Dates schedule.',
      'Timings is required.',
      'Trainer Email is required for External trainers.',
      'Meeting Platform must be Teams or Webex.',
      'Batch Type must be Internal/Mavericks or External/Segue.',
    ]))
  })

  it('parses batch Excel uploads', async () => {
    const blob = await workbookBlob(BATCH_TEMPLATE_COLUMNS, [
      'Execution Lab',
      '2026-05-20',
      '2026-05-22',
      'All Days',
      '',
      '10:00 AM - 1:00 PM',
      'External',
      'Avery Shah',
      'avery@example.com',
      '',
      '',
      'Teams',
      'Internal/Mavericks',
    ])

    const rows = await parseBatchTemplate(blob)
    expect(rows).toHaveLength(1)
    expect(rows[0].errors).toEqual([])
    expect(rows[0].batch.trainingType).toBe('Internal')
  })

  it('validates internal and external participant rows', () => {
    expect(validateParticipantTemplateRow({
      'Emp ID': 'EMP-1001',
      'Emp Name': 'Neha Rao',
    }, 'Internal/Mavericks')).toMatchObject({
      errors: [],
      participant: {
        empId: 'EMP-1001',
        empName: 'Neha Rao',
      },
    })

    expect(validateParticipantTemplateRow({
      'Superset ID': 'SUP-2001',
      'Emp Name': 'Sam Wilson',
      'Emp Email': 'sam@example.com',
      'College Name': 'Demo Institute',
      'Placement Officer Mail ID': 'placements@example.com',
    }, 'External/Segue')).toMatchObject({
      errors: [],
      participant: {
        supersetId: 'SUP-2001',
        collegeName: 'Demo Institute',
        placementOfficerEmail: 'placements@example.com',
      },
    })
  })

  it('requires external placement officer mail but not internal placement data', () => {
    expect(validateParticipantTemplateRow({
      'Emp ID': 'EMP-1001',
      'Emp Name': 'Neha Rao',
    }, 'Internal/Mavericks').errors).toEqual([])

    expect(validateParticipantTemplateRow({
      'Superset ID': 'SUP-2001',
      'Emp Name': 'Sam Wilson',
      'Emp Email': 'sam@example.com',
      'College Name': 'Demo Institute',
    }, 'External/Segue').errors).toContain('Placement Officer Mail ID is required.')
  })

  it('parses participant Excel uploads for selected batch type', async () => {
    const internalBlob = await workbookBlob(INTERNAL_PARTICIPANT_COLUMNS, [
      'EMP-1001',
      'Neha Rao',
    ])
    const externalBlob = await workbookBlob(EXTERNAL_PARTICIPANT_COLUMNS, [
      'SUP-2001',
      'Sam Wilson',
      'sam@example.com',
      '+91 90000 20001',
      'Demo Institute',
      'placements@example.com',
    ])

    await expect(parseParticipantTemplate(internalBlob, 'Internal/Mavericks'))
      .resolves.toMatchObject([{ participant: { empId: 'EMP-1001' }, errors: [] }])
    await expect(parseParticipantTemplate(externalBlob, 'External/Segue'))
      .resolves.toMatchObject([{
        participant: {
          supersetId: 'SUP-2001',
          placementOfficerEmail: 'placements@example.com',
        },
        errors: [],
      }])
  })
})
