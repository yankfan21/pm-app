// Parses an uploaded .xlsx or .csv File into a plain {headers, rows} shape -
// headers from the first row, every cell coerced to a string so downstream
// field-mapping/validation doesn't need to care whether a cell came from
// Excel's typed values or CSV's plain text.
export async function parseSpreadsheetFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    return parseCsv(await file.text())
  }
  if (name.endsWith('.xlsx')) {
    return parseXlsx(await file.arrayBuffer())
  }
  throw new Error('Unsupported file type - please upload a .xlsx or .csv file.')
}

function cellToString(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && 'text' in value) return String(value.text) // rich text
  if (typeof value === 'object' && 'result' in value) return String(value.result) // formula
  return String(value)
}

async function parseXlsx(arrayBuffer) {
  // Lazy-loaded: exceljs is heavy and would otherwise bloat every page load
  // even for users who never import a spreadsheet, same reasoning as its
  // lazy-load in ganttExport.js/budgetExport.js for export.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return { headers: [], rows: [] }

  const allRows = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values[0] is always undefined - ExcelJS rows are 1-indexed.
    allRows.push(row.values.slice(1).map(cellToString))
  })

  const [headers, ...rows] = allRows
  return { headers: headers || [], rows }
}

// Minimal RFC4180-ish CSV parser - handles quoted fields (with escaped ""
// and embedded commas/newlines), which covers what a normal Excel/Sheets CSV
// export produces. Not a general-purpose CSV library, since this project
// avoids adding a dependency for something this scoped.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmptyRows = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const [headers, ...dataRows] = nonEmptyRows
  return { headers: headers || [], rows: dataRows }
}

// Returns a YYYY-MM-DD string, null for a genuinely empty cell, or undefined
// to signal "had a value but couldn't parse it as a date" (a flaggable issue,
// distinct from empty).
export function parseDateCell(value) {
  const trimmed = (value || '').toString().trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (isNaN(parsed.getTime())) return undefined
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

// Best-effort auto-mapping from spreadsheet headers to target field keys, so
// the mapping step starts pre-filled instead of every dropdown on "None" -
// the user can still override any of it before continuing.
export function guessColumnMapping(headers, fieldHints) {
  const mapping = {}
  headers.forEach((header, index) => {
    const normalized = header.trim().toLowerCase()
    for (const [field, hints] of Object.entries(fieldHints)) {
      if (mapping[field] != null) continue
      if (hints.some((hint) => normalized === hint || normalized.includes(hint))) {
        mapping[field] = index
      }
    }
  })
  return mapping
}
