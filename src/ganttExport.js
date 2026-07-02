import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import ExcelJS from 'exceljs'

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

// Raw task data as a table - more useful in Excel than trying to recreate
// the visual bars. Dependency is resolved to the other task's title since a
// raw id isn't meaningful outside the app. Dates are kept as plain
// YYYY-MM-DD strings (not Date objects) to avoid any UTC/local timezone
// shift on cells that would otherwise silently move a date by a day.
export async function exportGanttExcel(project, tasks) {
  const titleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]))

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Gantt Chart')

  sheet.columns = [
    { header: 'Task', key: 'task', width: 32 },
    { header: 'Start Date', key: 'start', width: 14 },
    { header: 'Due Date', key: 'due', width: 14 },
    { header: 'Depends On', key: 'dependsOn', width: 28 },
  ]
  sheet.getRow(1).font = { bold: true }

  tasks.forEach((task) => {
    sheet.addRow({
      task: task.title,
      start: task.start_date || 'TBD',
      due: task.due_date || 'TBD',
      dependsOn: task.depends_on ? titleById[task.depends_on] || '' : '',
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Gantt-Chart.xlsx`)
}

// Captures the chart exactly as it's currently rendered (bars, today
// marker, dependency arrows) rather than redrawing it, so it matches
// what's on screen.
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
