import jsPDF from 'jspdf'
import ExcelJS from 'exceljs'
import { DAY_MS, computeGanttLayout } from './ganttLayout'

const INFO_HEADERS = ['Task', 'Start Date', 'Due Date', 'Depends On']

const NAVY = [30, 58, 138]
const GREEN = [34, 197, 94]
const DARK_TEXT = [22, 21, 26]
const MUTED_TEXT = [120, 120, 120]
const GRIDLINE = [225, 225, 225]
const DEP_LINE = [148, 163, 184]
const TODAY_RED = [239, 68, 68]

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

// A tick every N days, chosen so there are roughly 8-14 gridlines across
// the chart regardless of how long the overall range is.
function pickTickIntervalDays(totalDays) {
  const candidates = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 120]
  return candidates.find((c) => totalDays / c <= 14) || 180
}

// ms values here (rangeStart, tick positions, todayMs) all come from
// ganttLayout's parseDay(), which is local-midnight. Formatting them via
// toISOString() would read that back as a *UTC* calendar date instead,
// which disagrees with the local one for part of the day depending on the
// viewer's offset - use local getters instead, same as the live chart's
// own tick formatting.
function formatTickLabel(ms) {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

// Drawn natively with jsPDF rather than screenshotting the DOM - that
// approach inherited the live page's CSS (including theme-dependent colors
// that turned invisible on the forced-white export background) and made it
// hard to control label placement precisely. Native drawing measures each
// label against its bar with jsPDF's own text metrics, so "does this fit
// inside the bar" is exact rather than approximated from a rendered clone.
export async function exportGanttPdf(project, tasks) {
  const { bars, unscheduled, rangeStart, rangeEndRaw, totalSpan, todayInRange, todayMs } =
    computeGanttLayout(tasks, project)

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...DARK_TEXT)
  doc.text(project.name, marginX, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('GANTT CHART', marginX, 56)

  if (bars.length === 0) {
    doc.setFontSize(11)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('No scheduled tasks to chart yet.', marginX, 84)
    doc.save(`${sanitizeFilename(project.name)}-Gantt-Chart.pdf`)
    return
  }

  const frameX0 = marginX
  const frameX1 = pageWidth - marginX
  // Extra headroom above the frame so the "TODAY" label has its own row,
  // clear of the date-tick labels at any X position (see below).
  const frameTop = 84
  const chartX0 = frameX0 + 14
  const chartX1 = frameX1 - 14
  const chartWidth = chartX1 - chartX0
  const axisLabelY = frameTop + 14
  const gridTop = frameTop + 22
  const rowHeight = 22
  const barHeight = 13
  const gridBottom = gridTop + bars.length * rowHeight
  const frameBottom = gridBottom + 10

  function xForMs(ms) {
    return chartX0 + ((ms - rangeStart) / totalSpan) * chartWidth
  }

  // Outer frame
  doc.setDrawColor(...GRIDLINE)
  doc.roundedRect(frameX0, frameTop, frameX1 - frameX0, frameBottom - frameTop, 6, 6, 'S')

  // Vertical date gridlines + axis labels, always at a consistent interval
  // regardless of where "today" falls - it renders as a separate overlay
  // (own line, own label row above the frame) rather than competing for a
  // slot in this list, so it can never displace a regular tick.
  const totalDays = Math.round(totalSpan / DAY_MS)
  const tickDays = pickTickIntervalDays(totalDays)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  // A short date label like "07-01" needs roughly this much horizontal room
  // to itself - used to drop the always-shown range-end tick if it would
  // otherwise render close enough to the last regular tick to overlap it.
  const MIN_LABEL_GAP = 26
  const tickMsList = []
  for (let d = 0; d <= totalDays; d += tickDays) tickMsList.push(rangeStart + d * DAY_MS)
  const lastRegular = tickMsList[tickMsList.length - 1]
  if (lastRegular !== rangeEndRaw) {
    if (xForMs(rangeEndRaw) - xForMs(lastRegular) < MIN_LABEL_GAP) {
      tickMsList[tickMsList.length - 1] = rangeEndRaw
    } else {
      tickMsList.push(rangeEndRaw)
    }
  }

  tickMsList.forEach((ms) => {
    const x = xForMs(ms)
    doc.setDrawColor(...GRIDLINE)
    doc.line(x, gridTop, x, gridBottom)
    doc.setTextColor(...MUTED_TEXT)
    const label = formatTickLabel(ms)
    doc.text(label, x, axisLabelY, { align: 'center' })
  })

  // Horizontal row gridlines
  doc.setDrawColor(...GRIDLINE)
  for (let r = 0; r <= bars.length; r++) {
    const y = gridTop + r * rowHeight
    doc.line(chartX0, y, chartX1, y)
  }

  // Bars, keeping each task's geometry around for the dependency-arrow pass.
  const barGeometry = {}
  bars.forEach(({ task, startMs, dueMs }, i) => {
    const rowTop = gridTop + i * rowHeight
    const centerY = rowTop + rowHeight / 2
    const barY = rowTop + (rowHeight - barHeight) / 2

    const leftPct = (startMs - rangeStart) / totalSpan
    const widthPct = Math.max((dueMs - startMs) / totalSpan, 0.015)
    const barX0 = chartX0 + leftPct * chartWidth
    const barWidth = widthPct * chartWidth
    const barX1 = barX0 + barWidth

    barGeometry[task.id] = { barX0, barX1, centerY }

    doc.setFillColor(...(task.completed ? GREEN : NAVY))
    doc.roundedRect(barX0, barY, barWidth, barHeight, 2.5, 2.5, 'F')
  })

  // Today marker: a dashed line plus its own label row above the frame
  // entirely, well clear of the date-tick labels at axisLabelY - so it
  // coexists with whatever regular tick happens to land nearby instead of
  // needing to displace one to avoid overlapping it.
  if (todayInRange) {
    const x = xForMs(todayMs)
    doc.setDrawColor(...TODAY_RED)
    doc.setLineWidth(1)
    doc.setLineDashPattern([2, 1.5], 0)
    doc.line(x, gridTop, x, gridBottom)
    doc.setLineDashPattern([], 0)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TODAY_RED)
    doc.text('TODAY', x, frameTop - 12, { align: 'center' })
  }

  // Dependency arrows: a straight finish-to-start line from the right edge
  // of the dependency's bar to the left edge of the dependent's bar, same
  // semantics as the live chart's SVG overlay.
  doc.setDrawColor(...DEP_LINE)
  doc.setLineWidth(1)
  bars.forEach(({ task }) => {
    if (!task.depends_on) return
    const from = barGeometry[task.depends_on]
    const to = barGeometry[task.id]
    if (!from || !to) return

    doc.line(from.barX1, from.centerY, to.barX0, to.centerY)
    doc.setFillColor(...DEP_LINE)
    doc.triangle(
      to.barX0,
      to.centerY,
      to.barX0 - 5,
      to.centerY - 3,
      to.barX0 - 5,
      to.centerY + 3,
      'F'
    )
  })

  // Labels last, drawn on top of everything else so they're always fully
  // legible - inside the bar (white text) when it's wide enough to hold the
  // label; otherwise beside that specific bar (dark text), preferring the
  // right side but flipping to the left when a bar sits close enough to the
  // chart's right edge that a right-side label would run off the page.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  bars.forEach(({ task }) => {
    const { barX0, barX1, centerY } = barGeometry[task.id]
    const barWidth = barX1 - barX0
    const label = task.title
    const textWidth = doc.getTextWidth(label)
    const pad = 6

    if (textWidth + pad * 2 <= barWidth) {
      doc.setTextColor(255, 255, 255)
      doc.text(label, barX0 + pad, centerY, { baseline: 'middle' })
    } else if (barX1 + 6 + textWidth <= chartX1) {
      doc.setTextColor(...DARK_TEXT)
      doc.text(label, barX1 + 6, centerY, { baseline: 'middle' })
    } else {
      doc.setTextColor(...DARK_TEXT)
      doc.text(label, barX0 - 6, centerY, { align: 'right', baseline: 'middle' })
    }
  })

  // Legend explaining the visual vocabulary, so the chart is readable as a
  // standalone document without needing the app for context. Shown as a
  // fixed reference (not conditioned on what's actually present in this
  // particular chart) for consistency across exports.
  const legendY = frameBottom + 22
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  let lx = marginX
  const swatchH = 8

  function advance(swatchW, label) {
    doc.setTextColor(...DARK_TEXT)
    doc.text(label, lx + swatchW + 5, legendY, { baseline: 'middle' })
    lx += swatchW + 5 + doc.getTextWidth(label) + 16
  }

  doc.setFillColor(...NAVY)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  advance(18, 'Task (start–due)')

  doc.setFillColor(...NAVY)
  doc.roundedRect(lx, legendY - swatchH / 2, 6, swatchH, 1.5, 1.5, 'F')
  advance(6, 'Single date only')

  doc.setFillColor(...GREEN)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  advance(18, 'Completed')

  doc.setDrawColor(...DEP_LINE)
  doc.setLineWidth(1)
  doc.line(lx, legendY, lx + 13, legendY)
  doc.setFillColor(...DEP_LINE)
  doc.triangle(lx + 18, legendY, lx + 13, legendY - 2.5, lx + 13, legendY + 2.5, 'F')
  advance(18, 'Dependency')

  doc.setDrawColor(...TODAY_RED)
  doc.setLineDashPattern([2, 1.5], 0)
  doc.line(lx + 9, legendY - swatchH / 2, lx + 9, legendY + swatchH / 2)
  doc.setLineDashPattern([], 0)
  advance(18, 'Today')

  // Unscheduled tasks, listed below the chart so the PDF stays a complete
  // standalone record even though they have nothing to plot.
  if (unscheduled.length > 0) {
    let y = legendY + 26
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('UNSCHEDULED', marginX, y)
    y += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...DARK_TEXT)
    unscheduled.forEach((task) => {
      doc.text(`• ${task.title}`, marginX, y)
      y += 14
    })
  }

  doc.save(`${sanitizeFilename(project.name)}-Gantt-Chart.pdf`)
}
