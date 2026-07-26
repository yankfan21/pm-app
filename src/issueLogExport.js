import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

const COLUMNS = [
  { key: 'description', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'owner', label: 'Owner' },
  { key: 'status', label: 'Status' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'resolution_date', label: 'Date' },
]

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

export function exportIssueLogPdf(project, issues) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(project.name, marginX, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text('ISSUES LOG', marginX, 66)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 84,
    margin: { left: marginX, right: marginX },
    head: [COLUMNS.map((c) => c.label)],
    body: issues.map((i) => COLUMNS.map((c) => i[c.key] || String.fromCharCode(8212))),
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [38, 33, 92], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 55 },
      2: { cellWidth: 65 },
      3: { cellWidth: 65 },
      4: { cellWidth: 110 },
      5: { cellWidth: 60 },
    },
  })

  doc.save(`${sanitizeFilename(project.name)}-Issues-Log.pdf`)
}

export async function exportIssueLogDocx(project, issues) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: COLUMNS.map(
      (c) =>
        new TableCell({
          shading: { fill: '26215c' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: c.label, bold: true, color: 'FFFFFF' })],
            }),
          ],
        })
    ),
  })

  const dataRows = issues.map(
    (i) =>
      new TableRow({
        children: COLUMNS.map(
          (c) =>
            new TableCell({
              children: [new Paragraph(i[c.key] || '')],
            })
        ),
      })
  )

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  })

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: 'Issues Log', spacing: { after: 300 } }),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Issues-Log.docx`)
}
