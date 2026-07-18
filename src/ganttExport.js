import jsPDF from 'jspdf'
import ExcelJS from 'exceljs'
import { DAY_MS, buildElbowPoints, computeCriticalPath, computeGanttLayout } from './ganttLayout'

const INFO_HEADERS = ['Task', 'Start Date', 'Due Date', 'Depends On']

const BRAND_PURPLE = [38, 33, 92]
const GREEN = [34, 197, 94]
const DARK_TEXT = [22, 21, 26]
const MUTED_TEXT = [120, 120, 120]
const GRIDLINE = [225, 225, 225]
const DEP_LINE = [148, 163, 184]
const TODAY_RED = [239, 68, 68]
// Matches the on-screen palette (App.css / index.css --card-accent-*):
// delayed and single-date share the same hues used for the live chart's
// .delayed/.single-date classes, and critical-path reuses the same orange
// chosen for the on-screen ring/line highlight after the earlier violet
// turned out too close to the default bar color.
const DELAYED_RED = [220, 38, 38]
const SINGLE_DATE_AMBER = [217, 119, 6]
const CRITICAL_ORANGE = [249, 115, 22]

// Same completed > delayed > single-date > default precedence the
// on-screen CSS cascade uses (.gantt-bar.completed declared after
// .gantt-bar.delayed, which is declared after .gantt-bar.single-date).
// singleDate is passed explicitly rather than derived here so milestones
// (which are trivially single-date but never get the amber treatment
// on-screen) can opt out by passing false.
function barFillColor(task, singleDate) {
  if (task.completed) return GREEN
  if (task.status === 'delayed') return DELAYED_RED
  if (singleDate) return SINGLE_DATE_AMBER
  return BRAND_PURPLE
}

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
export async function exportGanttExcel(project, tasks, dependsOnByTaskId = new Map()) {
  const titleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]))
  const scheduled = tasks.filter((t) => t.start_date || t.due_date)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Gantt Chart')

  function addTaskRow(task) {
    const dependsOnIds = dependsOnByTaskId.get(task.id) || []
    const dependsOnTitles = dependsOnIds.map((id) => titleById[id]).filter(Boolean)
    const row = sheet.addRow([
      task.title,
      task.start_date || 'TBD',
      task.due_date || 'TBD',
      dependsOnTitles.join(', '),
    ])
    // A real dashed stroke isn't representable in a cell, so multiple
    // predecessors get a bold "Depends On" cell instead - the closest
    // equivalent to the dashed lines used on-screen and in the PDF export.
    if (dependsOnTitles.length > 1) {
      row.getCell(INFO_HEADERS.length).font = { bold: true }
    }
    return row
  }

  const hasMultiPredecessors = tasks.some(
    (t) => (dependsOnByTaskId.get(t.id) || []).length > 1
  )

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
    if (hasMultiPredecessors) {
      const note = sheet.addRow(['Bold "Depends On" = multiple predecessors'])
      note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
    }
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
    const fillColor = task.completed ? 'FF22C55E' : 'FF26215C'

    for (let c = startCol; c <= endCol; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    }
  })

  if (hasMultiPredecessors) {
    const note = sheet.addRow(['Bold "Depends On" = multiple predecessors'])
    note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
  }

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
export async function exportGanttPdf(project, tasks, dependsOnByTaskId = new Map(), taskDependencies = []) {
  const { bars, unscheduled, rangeStart, rangeEndRaw, totalSpan, todayInRange, todayMs } =
    computeGanttLayout(tasks, project)

  // Always computed (cheap, and a pure function) - critical path is a fixed
  // reference in the PDF like the rest of the legend, not tied to whatever
  // the live toggle happened to be set to at export time. hasEdges: false
  // just means every taskIds/edgeIds check below is against empty sets, so
  // nothing renders differently - no separate branch needed.
  const criticalPath = computeCriticalPath(bars, taskDependencies)

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Repeated on every page - page 1 gets the full title, later pages a
  // smaller "continued" header with a page count, so each page reads as
  // part of a complete document rather than assuming the reader has page 1
  // in hand. The critical-path summary is page-1-only (same as on-screen,
  // where it's a single line above the whole chart, not repeated anywhere).
  function drawHeader(pageIndex, pageCount) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(pageIndex === 0 ? 18 : 13)
    doc.setTextColor(...DARK_TEXT)
    doc.text(project.name, marginX, 40)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(
      pageCount > 1 ? `GANTT CHART — PAGE ${pageIndex + 1} OF ${pageCount}` : 'GANTT CHART',
      marginX,
      56
    )

    if (pageIndex === 0 && criticalPath.hasEdges) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...CRITICAL_ORANGE)
      const taskWord = criticalPath.taskCount === 1 ? 'task' : 'tasks'
      const dayWord = criticalPath.totalDays === 1 ? 'day' : 'days'
      doc.text(
        `Critical path: ${criticalPath.taskCount} ${taskWord} · ${criticalPath.totalDays} ${dayWord}`,
        marginX,
        70
      )
    }
  }

  if (bars.length === 0) {
    drawHeader(0, 1)
    doc.setFontSize(11)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('No scheduled tasks to chart yet.', marginX, 84)
    doc.save(`${sanitizeFilename(project.name)}-Gantt-Chart.pdf`)
    return
  }

  const frameX0 = marginX
  const frameX1 = pageWidth - marginX
  // Extra headroom above the frame when the critical-path summary is
  // shown - kept the same on every page (not just page 1) so the grid
  // lines up at an identical Y from page to page, even though the summary
  // text itself only actually renders once, on page 1. Also leaves the
  // "TODAY" label its own row, clear of the date-tick labels at any X
  // position (see below).
  const frameTop = criticalPath.hasEdges ? 96 : 84
  const chartX0 = frameX0 + 14
  const chartX1 = frameX1 - 14
  const chartWidth = chartX1 - chartX0
  const axisLabelY = frameTop + 14
  const gridTop = frameTop + 22
  const rowHeight = 22
  const barHeight = 13

  function xForMs(ms) {
    return chartX0 + ((ms - rangeStart) / totalSpan) * chartWidth
  }

  // Rows-per-page is capped so every page - not just the last - leaves
  // room below its own frame for the legend (a fixed ~2-row block: its
  // content never varies export to export, only whether it wraps, and it
  // always wraps to 2 rows at this page width once milestone/delayed/
  // critical-path entries brought the count to 10) plus a bottom margin.
  // Reserving it uniformly is simpler and safer than only reserving it on
  // whichever page turns out to be last: a 23-task project previously
  // pushed the grid itself to the exact page edge (612pt on landscape
  // Letter) with zero room left for the frame border, legend, or
  // unscheduled list - they were drawn past the page's MediaBox and
  // silently discarded, no exception, nothing in the content stream. This
  // reserve is what prevents that from recurring at any project size.
  const bottomReserve = 90
  const rowsPerPage = Math.max(1, Math.floor((pageHeight - bottomReserve - gridTop) / rowHeight))
  const pageCount = Math.ceil(bars.length / rowsPerPage)

  function pageBarsFor(pageIndex) {
    return bars.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)
  }

  // Vertical date gridlines + axis labels are the same on every page (full
  // date range, not just this page's rows) - computed once. "Today" is a
  // separate overlay (own line, own label row above the frame) rather than
  // competing for a slot in this list, so it can never displace a regular
  // tick.
  const totalDays = Math.round(totalSpan / DAY_MS)
  const tickDays = pickTickIntervalDays(totalDays)
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

  const barGeometry = {}
  const pageIndexByTaskId = {}
  const frameBottomByPage = []

  // Pass 1: frame, gridlines, bars/milestones, Today marker - one page at
  // a time, since each jsPDF page is its own canvas; doc.addPage() both
  // creates and selects the new one as the drawing target.
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (pageIndex > 0) doc.addPage()
    drawHeader(pageIndex, pageCount)

    const pageBars = pageBarsFor(pageIndex)
    const gridBottom = gridTop + pageBars.length * rowHeight
    const frameBottom = gridBottom + 10
    frameBottomByPage.push(frameBottom)

    doc.setDrawColor(...GRIDLINE)
    doc.roundedRect(frameX0, frameTop, frameX1 - frameX0, frameBottom - frameTop, 6, 6, 'S')

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    tickMsList.forEach((ms) => {
      const x = xForMs(ms)
      doc.setDrawColor(...GRIDLINE)
      doc.line(x, gridTop, x, gridBottom)
      doc.setTextColor(...MUTED_TEXT)
      doc.text(formatTickLabel(ms), x, axisLabelY, { align: 'center' })
    })

    doc.setDrawColor(...GRIDLINE)
    for (let r = 0; r <= pageBars.length; r++) {
      const y = gridTop + r * rowHeight
      doc.line(chartX0, y, chartX1, y)
    }

    // Bars (and milestone diamonds). A milestone skips the regular bar
    // draw entirely - it renders as a small diamond polygon instead, same
    // shape family as the triangle arrowheads below (jsPDF has no diamond
    // primitive, so this is built from doc.lines() the same way jsPDF's
    // own triangle() is - a start point plus relative deltas, closed
    // explicitly).
    pageBars.forEach(({ task, startMs, dueMs }, i) => {
      pageIndexByTaskId[task.id] = pageIndex
      const rowTop = gridTop + i * rowHeight
      const centerY = rowTop + rowHeight / 2
      const isMilestone = task.task_type === 'milestone_marker'
      const isCritical = criticalPath.taskIds.has(task.id)

      if (isMilestone) {
        const cx = xForMs(dueMs)
        const r = 7
        barGeometry[task.id] = { barX0: cx - r, barX1: cx + r, centerY }

        doc.setFillColor(...barFillColor(task, false))
        doc.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, centerY - r, [1, 1], 'F', true)

        if (isCritical) {
          const ringR = r + 3
          doc.setDrawColor(...CRITICAL_ORANGE)
          doc.setLineWidth(1.5)
          doc.lines(
            [[ringR, ringR], [-ringR, ringR], [-ringR, -ringR], [ringR, -ringR]],
            cx,
            centerY - ringR,
            [1, 1],
            'S',
            true
          )
        }
        return
      }

      const singleDate = !task.start_date || !task.due_date
      const barY = rowTop + (rowHeight - barHeight) / 2

      const leftPct = (startMs - rangeStart) / totalSpan
      const widthPct = Math.max((dueMs - startMs) / totalSpan, 0.015)
      const barX0 = chartX0 + leftPct * chartWidth
      const barWidth = widthPct * chartWidth
      const barX1 = barX0 + barWidth

      barGeometry[task.id] = { barX0, barX1, centerY }

      doc.setFillColor(...barFillColor(task, singleDate))
      doc.roundedRect(barX0, barY, barWidth, barHeight, 2.5, 2.5, 'F')

      // Ring rather than a resize - mirrors the on-screen box-shadow
      // approach (layers over whichever status color the bar already has)
      // instead of replacing the fill.
      if (isCritical) {
        doc.setDrawColor(...CRITICAL_ORANGE)
        doc.setLineWidth(1.5)
        doc.roundedRect(barX0 - 1.5, barY - 1.5, barWidth + 3, barHeight + 3, 3.5, 3.5, 'S')
      }
    })

    // Today marker: a dashed line plus its own label row above the frame
    // entirely, well clear of the date-tick labels at axisLabelY. Redrawn
    // on every page - "today" isn't tied to any one page's rows, it's a
    // reference against the date axis, which every page shows in full.
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
  }

  // Pass 2: dependency arrows, page by page - both endpoints have to be on
  // the same physical page to draw a connector between them (a jsPDF page
  // is its own canvas), so a dependency that spans a page break is simply
  // not drawn. The on-screen chart has no equivalent limit since it's one
  // continuous scrollable surface; this is a PDF-only constraint. Run as
  // its own pass (not folded into Pass 1) because a task can depend on one
  // that appears later in the array, and every task's geometry needs to be
  // known before any connector is drawn, regardless of row order.
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    doc.setPage(pageIndex + 1)

    // Orthogonal (H-V-H) finish-to-start connector from the right edge of
    // the dependency's bar to the left edge of the dependent's bar, via
    // the same buildElbowPoints the live chart's SVG overlay uses - routing
    // can't drift between the two anymore since both read from one
    // function. Critical-path edges get the same orange/thicker treatment
    // as on-screen, layered on top of (not replacing) the dashed-vs-solid
    // multi-predecessor distinction - dash is decided once per task,
    // color/width per edge, so a critical edge that's also multi-
    // predecessor stays dashed, just orange.
    pageBarsFor(pageIndex).forEach(({ task }) => {
      const dependsOnIds = dependsOnByTaskId.get(task.id) || []
      if (dependsOnIds.length === 0) return
      const to = barGeometry[task.id]
      if (!to) return
      // 2+ predecessors: dash every line for this task, not just the
      // extras, matching the on-screen chart's convention.
      const dashed = dependsOnIds.length > 1
      if (dashed) doc.setLineDashPattern([3, 2], 0)

      dependsOnIds.forEach((dependsOnId) => {
        if (pageIndexByTaskId[dependsOnId] !== pageIndex) return
        const from = barGeometry[dependsOnId]
        if (!from) return

        const isCriticalEdge = criticalPath.edgeIds.has(`${dependsOnId}-${task.id}`)
        const lineColor = isCriticalEdge ? CRITICAL_ORANGE : DEP_LINE
        doc.setDrawColor(...lineColor)
        doc.setLineWidth(isCriticalEdge ? 2 : 1)

        const points = buildElbowPoints(from.barX1, from.centerY, to.barX0, to.centerY)
        for (let p = 0; p < points.length - 1; p++) {
          doc.line(points[p][0], points[p][1], points[p + 1][0], points[p + 1][1])
        }

        doc.setFillColor(...lineColor)
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

      if (dashed) doc.setLineDashPattern([], 0)
    })
  }

  // Pass 3: labels, drawn last (on top of bars/lines) so they're always
  // fully legible - inside the bar (white text) when it's wide enough to
  // hold the label; otherwise beside that specific bar (dark text),
  // preferring the right side but flipping to the left when a bar sits
  // close enough to the chart's right edge that a right-side label would
  // run off the page. Same per-page reasoning as Pass 2.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    doc.setPage(pageIndex + 1)
    pageBarsFor(pageIndex).forEach(({ task }) => {
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
  }

  // Legend explaining the visual vocabulary, so the chart is readable as a
  // standalone document without needing the app for context. Shown as a
  // fixed reference (not conditioned on what's actually present in this
  // particular chart) for consistency across exports - same reasoning
  // extends to Critical path/Critical path dependency below: always shown
  // if the legend is shown at all, not conditioned on whether this
  // project's dependency graph happens to produce one. Always drawn on the
  // last page - the bottomReserve baked into rowsPerPage above guarantees
  // room for it (and the unscheduled list) below that page's own frame,
  // however many rows ended up on it.
  doc.setPage(pageCount)
  const legendFrameBottom = frameBottomByPage[frameBottomByPage.length - 1]
  let legendY = legendFrameBottom + 22
  const legendRowGap = 16
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  let lx = marginX
  const swatchH = 8

  // Wraps to a new legend row when the upcoming item would run past the
  // chart's right edge - a fixed single-row legend stopped fitting once
  // milestone/delayed/critical-path entries brought the count to 10.
  function startItem(swatchW, label) {
    const itemWidth = swatchW + 5 + doc.getTextWidth(label) + 16
    if (lx + itemWidth > frameX1 && lx > marginX) {
      lx = marginX
      legendY += legendRowGap
    }
  }

  function advance(swatchW, label) {
    doc.setTextColor(...DARK_TEXT)
    doc.text(label, lx + swatchW + 5, legendY, { baseline: 'middle' })
    lx += swatchW + 5 + doc.getTextWidth(label) + 16
  }

  startItem(18, 'Task (start–due)')
  doc.setFillColor(...BRAND_PURPLE)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  advance(18, 'Task (start–due)')

  startItem(6, 'Single date only')
  doc.setFillColor(...BRAND_PURPLE)
  doc.roundedRect(lx, legendY - swatchH / 2, 6, swatchH, 1.5, 1.5, 'F')
  advance(6, 'Single date only')

  startItem(swatchH, 'Milestone')
  {
    const r = swatchH / 2
    const cx = lx + r
    doc.setFillColor(...BRAND_PURPLE)
    doc.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, legendY - r, [1, 1], 'F', true)
  }
  advance(swatchH, 'Milestone')

  startItem(18, 'Delayed')
  doc.setFillColor(...DELAYED_RED)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  advance(18, 'Delayed')

  startItem(18, 'Completed')
  doc.setFillColor(...GREEN)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  advance(18, 'Completed')

  startItem(18, 'Critical path')
  doc.setFillColor(...BRAND_PURPLE)
  doc.roundedRect(lx, legendY - swatchH / 2, 18, swatchH, 2, 2, 'F')
  doc.setDrawColor(...CRITICAL_ORANGE)
  doc.setLineWidth(1.5)
  doc.roundedRect(lx - 1.5, legendY - swatchH / 2 - 1.5, 18 + 3, swatchH + 3, 3.5, 3.5, 'S')
  advance(18, 'Critical path')

  startItem(18, 'Dependency')
  doc.setDrawColor(...DEP_LINE)
  doc.setLineWidth(1)
  doc.line(lx, legendY, lx + 13, legendY)
  doc.setFillColor(...DEP_LINE)
  doc.triangle(lx + 18, legendY, lx + 13, legendY - 2.5, lx + 13, legendY + 2.5, 'F')
  advance(18, 'Dependency')

  startItem(18, 'Multiple predecessors')
  doc.setDrawColor(...DEP_LINE)
  doc.setLineWidth(1)
  doc.setLineDashPattern([3, 2], 0)
  doc.line(lx, legendY, lx + 13, legendY)
  doc.setLineDashPattern([], 0)
  doc.setFillColor(...DEP_LINE)
  doc.triangle(lx + 18, legendY, lx + 13, legendY - 2.5, lx + 13, legendY + 2.5, 'F')
  advance(18, 'Multiple predecessors')

  startItem(18, 'Critical path dependency')
  doc.setDrawColor(...CRITICAL_ORANGE)
  doc.setLineWidth(2)
  doc.line(lx, legendY, lx + 13, legendY)
  doc.setFillColor(...CRITICAL_ORANGE)
  doc.triangle(lx + 18, legendY, lx + 13, legendY - 2.5, lx + 13, legendY + 2.5, 'F')
  advance(18, 'Critical path dependency')

  startItem(18, 'Today')
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
