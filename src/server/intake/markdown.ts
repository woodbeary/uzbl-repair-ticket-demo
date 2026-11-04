export interface MarkdownTable {
  title: string | null
  rows: string[][]
}

function splitRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '|') {
      cell += '|'
      i++
    } else if (body[i] === '|') {
      cells.push(cell)
      cell = ''
    } else {
      cell += body[i]
    }
  }
  cells.push(cell)
  return cells.map((value) => value.replace(/<br\s*\/?>/gi, ' ').trim())
}

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/**
 * Pulls every pipe table out of Workers AI toMarkdown output. The separator row is dropped, and
 * the header row is kept as a normal row: messy sheets often have a title where a header should be,
 * so the real header is found later by detectTable().
 */
export function parseMarkdownTables(markdown: string): MarkdownTable[] {
  const tables: MarkdownTable[] = []
  let current: MarkdownTable | null = null
  let lastHeading: string | null = null

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|')) {
      if (!current) {
        current = { title: lastHeading, rows: [] }
        tables.push(current)
      }
      if (!SEPARATOR.test(trimmed)) current.rows.push(splitRow(trimmed))
      continue
    }
    current = null
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/)
    if (heading) lastHeading = heading[1].trim()
  }
  return tables
}
