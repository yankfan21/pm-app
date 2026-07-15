import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

const COLUMNS = [
  { key: 'risk', label: 'Risk' },
  { key: 'likelihood', label: 'Likelihood' },
  { key: 'impact', label: 'Impact' },
  { key: 'mitigation', label: 'Mitigation' },
  { key: 'owner', label: 'Owner' },
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

export function exportRiskLogPdf(project, risks) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(project.name, marginX, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text('RISK LOG', marginX, 66)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 84,
    margin: { left: marginX, right: marginX },
    head: [COLUMNS.map((c) => c.label)],
    body: risks.map((r) => COLUMNS.map((c) => r[c.key] || String.fromCharCode(8212))),
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [38, 33, 92], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 60 },
      2: { cellWidth: 55 },
      3: { cellWidth: 140 },
      4: { cellWidth: 75 },
    },
  })

  doc.save(`${sanitizeFilename(project.name)}-Risk-Log.pdf`)
}

export async function exportRiskLogDocx(project, risks) {
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

  const dataRows = risks.map(
    (r) =>
      new TableRow({
        children: COLUMNS.map(
          (c) =>
            new TableCell({
              children: [new Paragraph(r[c.key] || '')],
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
          new Paragraph({ text: 'Risk Log', spacing: { after: 300 } }),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Risk-Log.docx`)
}
