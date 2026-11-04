import { strFromU8, unzipSync } from 'fflate'

export interface Sheet {
  name: string
  rows: string[][]
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

function textRuns(xml: string): string {
  let out = ''
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += match[1]
  return decodeXml(out)
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/**
 * Small .xlsx reader (shared strings, inline strings, numbers). Used when Workers AI Markdown
 * Conversion is not available, such as local dev, or when its output has no usable table.
 */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes, {
    filter: (file) => (file.name.startsWith('xl/') && file.name.endsWith('.xml')) || file.name.endsWith('.rels'),
  })
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '')

  const shared: string[] = []
  for (const match of read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(match[1]))

  const rels = new Map<string, string>()
  for (const match of read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = match[0].match(/Id="([^"]+)"/)?.[1]
    const target = match[0].match(/Target="([^"]+)"/)?.[1]
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
  }

  const sheets: Sheet[] = []
  for (const match of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(match[0].match(/name="([^"]*)"/)?.[1] ?? 'Sheet')
    const relId = match[0].match(/r:id="([^"]+)"/)?.[1]
    const path = relId ? rels.get(relId) : undefined
    if (!path) continue
    const xml = read(path)
    const rows: string[][] = []
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1)
      const cells: string[] = []
      for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1]
        const body = cellMatch[2] ?? ''
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
        const type = attrs.match(/\bt="([^"]+)"/)?.[1]
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let value = ''
        if (type === 's' && raw !== undefined) value = shared[Number(raw)] ?? ''
        else if (type === 'inlineStr') value = textRuns(body)
        else if (raw !== undefined) value = decodeXml(raw)
        cells[ref ? columnIndex(ref) : cells.length] = value
      }
      rows[rowNumber - 1] = Array.from(cells, (value) => value ?? '')
    }
    sheets.push({ name, rows: Array.from(rows, (row) => row ?? []) })
  }
  return sheets
}
