import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

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

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  })
}

function buildRows(lineItems) {
  return lineItems.map((item) => {
    const estimated = Number(item.estimated_amount) || 0
    const actual = Number(item.actual_amount) || 0
    return {
      category: item.category || '',
      name: item.name || '',
      capexOpex: item.capex_opex_class ? (item.capex_opex_class === 'capex' ? 'Capex' : 'Opex') : '',
      glAccount: item.gl_account || '',
      estimated,
      actual,
      variance: actual - estimated,
    }
  })
}

function totals(rows) {
  const estimated = rows.reduce((t, r) => t + r.estimated, 0)
  const actual = rows.reduce((t, r) => t + r.actual, 0)
  return { estimated, actual, variance: actual - estimated }
}

export function exportBudgetPdf(project, lineItems) {
  const rows = buildRows(lineItems)
  const total = totals(rows)

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(project.name, marginX, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text('BUDGET TRACKER', marginX, 66)
  doc.setTextColor(0)
  doc.text(
    `Total Budget: ${formatMoney(total.estimated)}   Total Actual: ${formatMoney(total.actual)}   Variance: ${total.variance >= 0 ? '+' : ''}${formatMoney(total.variance)}`,
    marginX,
    82
  )

  autoTable(doc, {
    startY: 96,
    margin: { left: marginX, right: marginX },
    head: [['Category', 'Item', 'Capex/Opex', 'GL Account', 'Estimated', 'Actual', 'Variance']],
    body: rows.map((r) => [
      r.category || String.fromCharCode(8212),
      r.name || String.fromCharCode(8212),
      r.capexOpex || String.fromCharCode(8212),
      r.glAccount || String.fromCharCode(8212),
      formatMoney(r.estimated),
      formatMoney(r.actual),
      `${r.variance >= 0 ? '+' : ''}${formatMoney(r.variance)}`,
    ]),
    foot: [[
      'Total',
      '',
      '',
      '',
      formatMoney(total.estimated),
      formatMoney(total.actual),
      `${total.variance >= 0 ? '+' : ''}${formatMoney(total.variance)}`,
    ]],
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [38, 33, 92], textColor: 255 },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 120 },
      2: { cellWidth: 70 },
      3: { cellWidth: 80 },
      4: { cellWidth: 60 },
      5: { cellWidth: 60 },
      6: { cellWidth: 60 },
    },
  })

  doc.save(`${sanitizeFilename(project.name)}-Budget-Tracker.pdf`)
}

export async function exportBudgetDocx(project, lineItems) {
  const rows = buildRows(lineItems)
  const total = totals(rows)
  const columns = ['Category', 'Item', 'Capex/Opex', 'GL Account', 'Estimated', 'Actual', 'Variance']

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (label) =>
        new TableCell({
          shading: { fill: '26215c' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, bold: true, color: 'FFFFFF' })],
            }),
          ],
        })
    ),
  })

  const dataRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          new Paragraph(r.category),
          new Paragraph(r.name),
          new Paragraph(r.capexOpex),
          new Paragraph(r.glAccount),
          new Paragraph(formatMoney(r.estimated)),
          new Paragraph(formatMoney(r.actual)),
          new Paragraph(`${r.variance >= 0 ? '+' : ''}${formatMoney(r.variance)}`),
        ].map((p) => new TableCell({ children: [p] })),
      })
  )

  const totalsRow = new TableRow({
    children: [
      'Total',
      '',
      '',
      '',
      formatMoney(total.estimated),
      formatMoney(total.actual),
      `${total.variance >= 0 ? '+' : ''}${formatMoney(total.variance)}`,
    ].map(
      (text) =>
        new TableCell({
          shading: { fill: 'EBEBEB' },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
        })
    ),
  })

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, totalsRow],
  })

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: 'Budget Tracker', spacing: { after: 120 } }),
          new Paragraph({
            text: `Total Budget: ${formatMoney(total.estimated)}    Total Actual: ${formatMoney(total.actual)}    Variance: ${total.variance >= 0 ? '+' : ''}${formatMoney(total.variance)}`,
            spacing: { after: 300 },
          }),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Budget-Tracker.docx`)
}

export async function exportBudgetExcel(project, lineItems) {
  const ExcelJS = (await import('exceljs')).default
  const rows = buildRows(lineItems)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Budget Tracker')

  sheet.addRow(['Category', 'Item', 'Capex/Opex', 'GL Account', 'Estimated', 'Actual', 'Variance'])
  sheet.getRow(1).font = { bold: true }
  sheet.getColumn(1).width = 20
  sheet.getColumn(2).width = 32
  sheet.getColumn(3).width = 14
  sheet.getColumn(4).width = 18
  sheet.getColumn(5).width = 14
  sheet.getColumn(6).width = 14
  sheet.getColumn(7).width = 14

  rows.forEach((r) => {
    const rowNum = sheet.rowCount + 1
    sheet.addRow([
      r.category,
      r.name,
      r.capexOpex,
      r.glAccount,
      r.estimated,
      r.actual,
      { formula: `F${rowNum}-E${rowNum}` },
    ])
  })

  const firstDataRow = 2
  const lastDataRow = sheet.rowCount
  const totalsRow = sheet.addRow([
    'Total',
    '',
    '',
    '',
    lastDataRow >= firstDataRow ? { formula: `SUM(E${firstDataRow}:E${lastDataRow})` } : 0,
    lastDataRow >= firstDataRow ? { formula: `SUM(F${firstDataRow}:F${lastDataRow})` } : 0,
    lastDataRow >= firstDataRow ? { formula: `SUM(G${firstDataRow}:G${lastDataRow})` } : 0,
  ])
  totalsRow.font = { bold: true }

  sheet.getColumn(5).numFmt = '$#,##0.00'
  sheet.getColumn(6).numFmt = '$#,##0.00'
  sheet.getColumn(7).numFmt = '$#,##0.00'

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Budget-Tracker.xlsx`)
}
