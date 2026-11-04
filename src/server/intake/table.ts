export interface DetectedTable {
  headers: string[]
  rows: { rowNumber: number; cells: string[] }[]
  skipped: { rowNumber: number; reason: string }[]
}

const HEADER_WORDS =
  /\b(serial|s\/n|sn|asset|tag|model|device|what|happened|issue|problem|damage|description|date|when|reported|where|location|room|notes?|comments?|case|ship|address|return|name|student|kid|teacher|staff|type|touch)\b/i

function filled(cells: string[]): string[] {
  return cells.filter((cell) => cell.trim() !== '')
}

function headerScore(cells: string[]): number {
  const values = filled(cells)
  if (values.length < 2) return -1
  let score = 0
  for (const value of values) {
    if (value.length > 40) score -= 1
    else if (HEADER_WORDS.test(value)) score += 2
    else if (/\d{3,}/.test(value)) score -= 1
    else score += 0.25
  }
  return score
}

/**
 * Finds the real table in a messy sheet: skips title rows, blank rows, totals and notes,
 * and picks the header row by how header-like its cells are.
 */
export function detectTable(grid: string[][], firstRowNumber = 1): DetectedTable {
  const rows = grid.map((cells, i) => ({ rowNumber: i + firstRowNumber, cells: cells.map((cell) => (cell ?? '').toString().trim()) }))
  const skipped: DetectedTable['skipped'] = []

  let headerAt = -1
  let best = 0
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const score = headerScore(rows[i].cells)
    if (score > best) {
      best = score
      headerAt = i
    }
  }
  if (headerAt < 0) headerAt = rows.findIndex((row) => filled(row.cells).length >= 2)
  if (headerAt < 0) return { headers: [], rows: [], skipped }

  for (const row of rows.slice(0, headerAt)) {
    if (filled(row.cells).length) skipped.push({ rowNumber: row.rowNumber, reason: 'Title or note above the table' })
  }

  const width = Math.max(...rows.slice(headerAt).map((row) => row.cells.length))
  const headers = Array.from({ length: width }, (_, i) => rows[headerAt].cells[i] || `Column ${i + 1}`)
  const headerKey = headers.join('|').toLowerCase()

  const data: DetectedTable['rows'] = []
  for (const row of rows.slice(headerAt + 1)) {
    const values = filled(row.cells)
    if (!values.length) continue
    const first = values[0].toLowerCase()
    if (/^(total|totals|sum|count|grand total)\b/.test(first)) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'Totals row' })
      continue
    }
    if (row.cells.join('|').toLowerCase() === headerKey) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'Repeated header' })
      continue
    }
    if (values.length === 1 && values[0].length > 30) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'Note, not a device' })
      continue
    }
    data.push({ rowNumber: row.rowNumber, cells: Array.from({ length: width }, (_, i) => row.cells[i] ?? '') })
  }
  return { headers, rows: data, skipped }
}

/** Picks the sheet or table with the most device rows. */
export function bestTable<T extends { grid: string[][]; name: string | null; firstRowNumber?: number }>(candidates: T[]) {
  let winner: { candidate: T; table: DetectedTable } | null = null
  for (const candidate of candidates) {
    const table = detectTable(candidate.grid, candidate.firstRowNumber ?? 1)
    if (!winner || table.rows.length > winner.table.rows.length) winner = { candidate, table }
  }
  return winner
}
