import jsPDF from 'jspdf'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

const SECTIONS = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'scope', label: 'Scope' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'success_metrics', label: 'Success Metrics' },
  { key: 'risks', label: 'Risks' },
  { key: 'timeline', label: 'Timeline' },
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

export function exportCharterPdf(project, values) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 56
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - marginX * 2
  let y = 64

  function ensureSpace(lineHeight) {
    if (y + lineHeight > pageHeight - 56) {
      doc.addPage()
      y = 64
    }
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(20)
  doc.splitTextToSize(project.name, maxWidth).forEach((line) => {
    ensureSpace(26)
    doc.text(line, marginX, y)
    y += 26
  })

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(120)
  ensureSpace(18)
  doc.text('PROJECT CHARTER', marginX, y)
  y += 30
  doc.setTextColor(0)

  SECTIONS.forEach(({ key, label }) => {
    ensureSpace(24)
    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.text(label, marginX, y)
    y += 18

    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    const bodyText = values[key] || String.fromCharCode(8212)
    doc.splitTextToSize(bodyText, maxWidth).forEach((line) => {
      ensureSpace(16)
      doc.text(line, marginX, y)
      y += 16
    })
    y += 20
  })

  doc.save(`${sanitizeFilename(project.name)}-Charter.pdf`)
}

export async function exportCharterDocx(project, values) {
  const children = [
    new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: 'Project Charter', spacing: { after: 300 } }),
  ]

  SECTIONS.forEach(({ key, label }) => {
    children.push(
      new Paragraph({
        text: label,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 120 },
      })
    )

    const bodyText = values[key] || String.fromCharCode(8212)
    bodyText.split('\n').forEach((line) => {
      children.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 100 },
        })
      )
    })
  })

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${sanitizeFilename(project.name)}-Charter.docx`)
}
