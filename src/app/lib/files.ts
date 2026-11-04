// What the composer knows about an attached file before it is sent: a one-line summary for the
// chip and the contents for the preview sheet. Spreadsheets are read in the browser with the same
// small readers the server uses (pure TypeScript), so the preview shows what will be read.
import { parseCsv } from '@/server/intake/csv'
import { readXlsx } from '@/server/intake/xlsx'

export type FileKind = 'excel' | 'csv' | 'image' | 'text' | 'document'

export interface PreviewSheet {
  name: string
  rows: string[][]
}

export interface FileInfo {
  kind: FileKind
  /** "Excel · 21 rows · 2 sheets · 7 KB": what matters most first, since phones cut the end off. */
  summary: string
  sheets?: PreviewSheet[]
  image?: { url: string; width: number; height: number }
  text?: string
}

/** What is planted in each sample, as a few tags above its preview. */
export const SAMPLE_NOTES: Record<string, string[]> = {
  'pinecrest-repairs-oct.xlsx': ['Student names', 'Typo', 'Duplicate', 'PO box', 'Totals row'],
  'pinecrest-repairs.csv': ['No description', 'PO box in notes'],
  'repair-list-screenshot.png': ['A picture, not a file'],
}

const SAMPLE_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  png: 'image/png',
}

export function kindOf(name: string, type = ''): FileKind {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx' || ext === 'xlsm') return 'excel'
  if (ext === 'csv' || type === 'text/csv') return 'csv'
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext)) return 'image'
  if (ext === 'txt' || type === 'text/plain') return 'text'
  return 'document'
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Drops trailing empty rows and columns, so the preview grid is only as big as the data. */
export function trimGrid(rows: string[][]): string[][] {
  const kept = rows.map((row) => Array.from(row ?? [], (cell) => cell ?? ''))
  while (kept.length && kept[kept.length - 1].every((cell) => !cell.trim())) kept.pop()
  const width = Math.max(0, ...kept.map((row) => row.reduce((last, cell, i) => (cell.trim() ? i + 1 : last), 0)))
  return kept.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''))
}

function rowCount(sheets: PreviewSheet[]): string {
  const rows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
  return `${rows} ${rows === 1 ? 'row' : 'rows'}`
}

/** Fetches a sample from public/samples as a File, the same bytes the server reads. */
export async function sampleFile(name: string): Promise<File> {
  const response = await fetch(`/samples/${name}`)
  if (!response.ok) throw new Error('Sample file missing.')
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type || SAMPLE_TYPES[name.split('.').pop() ?? ''] || '' })
}

export async function inspectFile(file: File): Promise<FileInfo> {
  const kind = kindOf(file.name, file.type)
  const size = fileSize(file.size)
  try {
    if (kind === 'excel') {
      const sheets = readXlsx(new Uint8Array(await file.arrayBuffer())).map((sheet) => ({ name: sheet.name, rows: trimGrid(sheet.rows) }))
      return { kind, sheets, summary: `Excel · ${rowCount(sheets)} · ${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'} · ${size}` }
    }
    if (kind === 'csv') {
      const sheets = [{ name: file.name, rows: trimGrid(parseCsv(await file.text())) }]
      return { kind, sheets, summary: `CSV · ${rowCount(sheets)} · ${size}` }
    }
    if (kind === 'image') {
      const url = URL.createObjectURL(file)
      const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => reject(new Error('Unreadable image'))
        img.src = url
      })
      return { kind, image: { url, width, height }, summary: `Image · ${width}×${height} · ${size}` }
    }
    if (kind === 'text') return { kind, text: await file.text(), summary: `Text · ${size}` }
  } catch {
    // Unreadable here; the server still gets the file and says what it found.
  }
  return { kind, summary: `${file.name.split('.').pop()?.toUpperCase() ?? 'File'} · ${size}` }
}
