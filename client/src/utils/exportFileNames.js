// Implements client-side exportFileNames workflow and data-processing behavior.
// Centralizes human-readable filenames for downloaded reports that contain operational data.
function sanitizeSegment(value) {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildValueReportFileName(batch, reportName, generatedAt = new Date()) {
  const trainingName = sanitizeSegment(batch?.trainingName ?? batch?.name) || 'Training'
  const reportLabel = sanitizeSegment(reportName) || 'Report'
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const monthYear = safeDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return `${trainingName} - ${reportLabel} - ${monthYear}.xlsx`
}
