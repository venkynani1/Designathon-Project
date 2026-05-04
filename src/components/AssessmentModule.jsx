import { Download, FileSpreadsheet, Plus, Trophy, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  calculateTopper,
  downloadAssessmentTemplate,
  getAssessmentStats,
  parseAssessmentUpload,
} from '../utils/assessmentEngine'
import { createAssessmentReminder, createLogEntry } from '../utils/notificationEngine'

const assessmentTypes = ['Sprint', 'Coding/API', 'Project']

function createEmptyAssessment() {
  return {
    name: '',
    type: 'Sprint',
    date: '',
    cutoffScore: 70,
    maxScore: 100,
    weightage: 100,
  }
}

export function AssessmentModule({ batch, canEdit, onLogEvent, onUpdateBatch }) {
  const [form, setForm] = useState(createEmptyAssessment)
  const [message, setMessage] = useState('')
  const assessments = batch.assessments ?? []
  const stats = useMemo(() => getAssessmentStats(batch), [batch])
  const toppers = useMemo(() => calculateTopper(batch), [batch])

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const saveBatch = (nextBatch, logs = []) => {
    onUpdateBatch(batch.batchId, nextBatch)
    if (logs.length) onLogEvent?.(logs)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const assessment = {
      id: `ASM-${Date.now().toString().slice(-6)}`,
      ...form,
      cutoffScore: Number(form.cutoffScore),
      maxScore: Number(form.maxScore),
      weightage: Number(form.weightage),
      results: [],
      createdAt: new Date().toISOString(),
    }

    saveBatch(
      {
        ...batch,
        assessments: [...assessments, assessment],
      },
      [
        createLogEntry({
          action: 'assessment_created',
          batchId: batch.batchId,
          message: `Assessment ${assessment.name} created for ${batch.trainingName}.`,
        }),
        createAssessmentReminder(batch, assessment),
      ],
    )
    setForm(createEmptyAssessment())
    setMessage('Assessment setup saved.')
  }

  const handleUpload = async (event, assessmentId) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select an assessment CSV file.')
      return
    }

    try {
      const assessment = assessments.find((item) => item.id === assessmentId)
      const results = await parseAssessmentUpload(file, batch, assessment)
      const nextAssessments = assessments.map((item) =>
        item.id === assessmentId
          ? {
              ...item,
              results,
              uploadedFileName: file.name,
              uploadedAt: new Date().toISOString(),
            }
          : item,
      )

      saveBatch(
        {
          ...batch,
          assessments: nextAssessments,
        },
        [
          createLogEntry({
            action: 'assessment_upload',
            batchId: batch.batchId,
            category: 'alert',
            message: `${file.name} uploaded for assessment ${assessment.name}.`,
            recipient: batch.coordinatorSpoc ?? 'Coordinator',
            status: 'Completed',
            type: 'Assessment',
          }),
        ],
      )
      setMessage(`${results.length} assessment score(s) uploaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload assessment scores.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Assessment</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Assessment Setup and Scores</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Configure batch assessments, download score templates, upload CSV results, and calculate clearance.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Cleared" value={stats.cleared} />
          <SummaryCard label="Not Cleared" value={stats.notCleared} />
          <SummaryCard label="Remaining" value={stats.remaining} />
          <SummaryCard label="Clearance" value={`${stats.clearanceRate}%`} />
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}

      {canEdit ? (
        <form onSubmit={handleSubmit} className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <TextField label="Assessment name" value={form.name} onChange={(value) => updateField('name', value)} />
            <SelectField label="Type" options={assessmentTypes} value={form.type} onChange={(value) => updateField('type', value)} />
            <TextField label="Date" type="date" value={form.date} onChange={(value) => updateField('date', value)} />
            <TextField label="Cutoff score" type="number" value={form.cutoffScore} onChange={(value) => updateField('cutoffScore', value)} />
            <TextField label="Max score" type="number" value={form.maxScore} onChange={(value) => updateField('maxScore', value)} />
            <TextField label="Weightage" type="number" value={form.weightage} onChange={(value) => updateField('weightage', value)} />
          </div>
          <button
            type="submit"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Plus className="h-4 w-4" />
            Add assessment
          </button>
        </form>
      ) : null}

      <div className="mt-5 grid gap-4">
        {assessments.length ? (
          assessments.map((assessment) => (
            <article key={assessment.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{assessment.type}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{assessment.name}</h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    Date: {assessment.date || 'Not set'} | Cutoff: {assessment.cutoffScore}% | Max: {assessment.maxScore} | Weightage: {assessment.weightage}%
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Uploaded scores: {assessment.results?.length ?? 0}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => downloadAssessmentTemplate(batch)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <Download className="h-4 w-4" />
                    Template
                  </button>
                  {canEdit ? (
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300">
                      <Upload className="h-4 w-4" />
                      Upload scores
                      <input
                        accept=".csv,text/csv"
                        type="file"
                        onChange={(event) => handleUpload(event, assessment.id)}
                        className="sr-only"
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {assessment.results?.length ? (
                <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Emp_Id</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Score %</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {assessment.results.map((result) => (
                        <tr key={result.participantId} className="text-zinc-300">
                          <td className="px-4 py-3 font-medium text-white">{result.empId || '-'}</td>
                          <td className="px-4 py-3">{result.name}</td>
                          <td className="px-4 py-3">{result.email || '-'}</td>
                          <td className="px-4 py-3">{result.scorePercent}%</td>
                          <td className="px-4 py-3">{result.cleared ? 'Cleared' : 'Not Cleared'}</td>
                          <td className="px-4 py-3 text-zinc-400">{result.comments || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
            <FileSpreadsheet className="h-5 w-5 text-cyan-300" />
            No assessments configured yet.
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">Topper</p>
            <p className="mt-1 text-sm text-zinc-400">
              {toppers[0] ? `${toppers[0].name} (${toppers[0].finalScore}%)` : 'No topper calculated yet.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="min-w-28 rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function TextField({ label, onChange, type = 'text', value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <input
        required
        min={type === 'number' ? 0 : undefined}
        max={type === 'number' ? 100 : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      />
    </label>
  )
}

function SelectField({ label, onChange, options, value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
