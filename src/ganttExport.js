import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import ExcelJS from 'exceljs'

const DAY_MS = 24 * 60 * 60 * 1000
const INFO_HEADERS = ['Task', 'Start Date', 'Due Date', 'Depends On']

function sanitizeFilename(name) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')
  return cleaned || 'Untitled'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Parsed as UTC-midnight and only ever read back via getUTC* - this keeps
// the day-grid math (and the month/day labels built from it) immune to
// local-timezone shifting, the same guard used for the plain date strings
// in the info columns.
function toDateOnlyUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

async function saveWorkbook(workbook, project) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Gantt-Chart.xlsx`)
}

// A real Gantt chart, not a data table: task/date/dependency info columns
// on the left (dependency resolved to the other task's title, not a raw
// id), then a day-by-day date grid to the right with each task's cells
// filled solid across its start-to-due range to form a visual bar -
// mirroring the in-app chart rather than just listing the same fields as
// flat text.
export async function exportGanttExcel(project, tasks) {
  const titleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]))
  const scheduled = tasks.filter((t) => t.start_date || t.due_date)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Gantt Chart')

  function addTaskRow(task) {
    const row = sheet.addRow([
      task.title,
      task.start_date || 'TBD',
      task.due_date || 'TBD',
      task.depends_on ? titleById[task.depends_on] || '' : '',
    ])
    return row
  }

  // No task has a date at all - nothing to build a day-grid from, so fall
  // back to a plain table.
  if (scheduled.length === 0) {
    sheet.addRow(INFO_HEADERS)
    sheet.getRow(1).font = { bold: true }
    sheet.getColumn(1).width = 32
    sheet.getColumn(2).width = 14
    sheet.getColumn(3).width = 14
    sheet.getColumn(4).width = 28
    tasks.forEach(addTaskRow)
    await saveWorkbook(workbook, project)
    return
  }

  const starts = scheduled.map((t) => toDateOnlyUTC(t.start_date || t.due_date))
  const dues = scheduled.map((t) => toDateOnlyUTC(t.due_date || t.start_date))
  const rangeStartMs = Math.min(...starts)
  const rangeEndMs = Math.max(...dues)
  const dayCount = Math.round((rangeEndMs - rangeStartMs) / DAY_MS) + 1
  const firstDateCol = INFO_HEADERS.length + 1

  // Row 1+2 header: info columns merged vertically across both rows, date
  // columns grouped into merged month labels (row 1) over day numbers (row 2).
  INFO_HEADERS.forEach((label, i) => {
    const col = i + 1
    sheet.mergeCells(1, col, 2, col)
    sheet.getCell(1, col).value = label
  })

  let col = firstDateCol
  let i = 0
  while (i < dayCount) {
    const monthStartCol = col
    const d0 = new Date(rangeStartMs + i * DAY_MS)
    const monthKey = `${d0.getUTCFullYear()}-${d0.getUTCMonth()}`

    while (i < dayCount) {
      const d = new Date(rangeStartMs + i * DAY_MS)
      if (`${d.getUTCFullYear()}-${d.getUTCMonth()}` !== monthKey) break
      sheet.getCell(2, col).value = d.getUTCDate()
      col++
      i++
    }

    if (col - 1 > monthStartCol) {
      sheet.mergeCells(1, monthStartCol, 1, col - 1)
    }
    sheet.getCell(1, monthStartCol).value = d0.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(2).font = { bold: true, size: 9 }
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).alignment = { horizontal: 'center' }

  sheet.getColumn(1).width = 28
  sheet.getColumn(2).width = 12
  sheet.getColumn(3).width = 12
  sheet.getColumn(4).width = 24
  for (let c = firstDateCol; c < firstDateCol + dayCount; c++) {
    sheet.getColumn(c).width = 3.2
  }

  // Info columns + both header rows stay visible while scrolling the grid.
  sheet.views = [{ state: 'frozen', xSplit: INFO_HEADERS.length, ySplit: 2 }]

  tasks.forEach((task) => {
    const row = addTaskRow(task)
    if (!task.start_date && !task.due_date) return

    const taskStartMs = toDateOnlyUTC(task.start_date || task.due_date)
    const taskDueMs = toDateOnlyUTC(task.due_date || task.start_date)
    const startCol = firstDateCol + Math.round((taskStartMs - rangeStartMs) / DAY_MS)
    const endCol = firstDateCol + Math.round((taskDueMs - rangeStartMs) / DAY_MS)
    const fillColor = task.completed ? 'FF22C55E' : 'FF1E3A8A'

    for (let c = startCol; c <= endCol; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    }
  })

  await saveWorkbook(workbook, project)
}

// Captures the chart exactly as it's currently rendered (bars, today
// marker, dependency arrows, and now-unclipped task labels - see the CSS
// change making .gantt-row-label wrap instead of truncate) rather than
// redrawing it, so the PDF matches what's on screen and stays readable as
// a standalone document.
export async function exportGanttPdf(project, element) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
  })
  const imgData = canvas.toDataURL('image/png')

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(project.name, marginX, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text('GANTT CHART', marginX, 56)
  doc.setTextColor(0)

  const maxWidth = pageWidth - marginX * 2
  const maxHeight = pageHeight - 90
  const imgRatio = canvas.width / canvas.height
  let renderWidth = maxWidth
  let renderHeight = renderWidth / imgRatio
  if (renderHeight > maxHeight) {
    renderHeight = maxHeight
    renderWidth = renderHeight * imgRatio
  }

  doc.addImage(imgData, 'PNG', marginX, 72, renderWidth, renderHeight)
  doc.save(`${sanitizeFilename(project.name)}-Gantt-Chart.pdf`)
}
