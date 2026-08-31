import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TableLayoutType, TextRun, WidthType } from 'docx'
import { LIKELIHOOD_SCALE, SEVERITY_SCALE, getRiskScore, getRiskBand, scaleLabel } from './riskScale'

const COLUMNS = [
  {
    key: 'risk',
    label: 'Risk',
    format: (r) => (r.description ? `${r.title}\n${r.description}` : r.title),
  },
  { key: 'likelihood', label: 'Likelihood', format: (r) => scaleLabel(LIKELIHOOD_SCALE, r.likelihood) },
  { key: 'severity', label: 'Severity', format: (r) => scaleLabel(SEVERITY_SCALE, r.severity) },
  {
    key: 'score',
    label: 'Score / Band',
    format: (r) => {
      const score = getRiskScore(r.likelihood, r.severity)
      const band = getRiskBand(r.likelihood, r.severity)
      return score == null ? 'Needs scoring' : `${score} (${band})`
    },
  },
  { key: 'mitigation', label: 'Mitigation' },
  { key: 'owner', label: 'Owner' },
]

function cellText(row, column) {
  return column.format ? column.format(row) : row[column.key]
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
    body: risks.map((r) => COLUMNS.map((c) => cellText(r, c) || String.fromCharCode(8212))),
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [38, 33, 92], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 65 },
      2: { cellWidth: 60 },
      3: { cellWidth: 70 },
      4: { cellWidth: 110 },
      5: { cellWidth: 65 },
    },
  })

  doc.save(`${sanitizeFilename(project.name)}-Risk-Log.pdf`)
}

// Twips (1/20 pt), proportioned to match exportRiskLogPdf's columnStyles cellWidths
// (120:65:60:70:110:65 pt), scaled to total ~9360 twips (6.5in content width).
const DOCX_COLUMN_WIDTHS = [2293, 1242, 1146, 1337, 2101, 1241]

function riskCellParagraphs(text) {
  const lines = text.split('\n')
  return [
    new Paragraph({
      children: lines.map((line, i) => new TextRun({ text: line, break: i === 0 ? undefined : 1 })),
    }),
  ]
}

export async function exportRiskLogDocx(project, risks) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: COLUMNS.map(
      (c, i) =>
        new TableCell({
          width: { size: DOCX_COLUMN_WIDTHS[i], type: WidthType.DXA },
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
          (c, i) =>
            new TableCell({
              width: { size: DOCX_COLUMN_WIDTHS[i], type: WidthType.DXA },
              children:
                c.key === 'risk'
                  ? riskCellParagraphs(cellText(r, c) || '')
                  : [new Paragraph(cellText(r, c) || '')],
            })
        ),
      })
  )

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: DOCX_COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
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
