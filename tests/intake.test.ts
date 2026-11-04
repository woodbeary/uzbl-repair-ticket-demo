import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VISION_MODEL, createModels } from '../src/server/ai/models'
import { parseCsv } from '../src/server/intake/csv'
import { parseMarkdownTables } from '../src/server/intake/markdown'
import { runIntake } from '../src/server/intake/pipeline'
import { detectTable } from '../src/server/intake/table'
import { readXlsx } from '../src/server/intake/xlsx'
import type { IntakeEvent, IntakeRow } from '../src/shared/types'

const TODAY = '2026-10-23'
const xlsx = new Uint8Array(readFileSync(new URL('../public/samples/pinecrest-repairs-oct.xlsx', import.meta.url)))
const csv = readFileSync(new URL('../public/samples/pinecrest-repairs.csv', import.meta.url))

async function intake(name: string, bytes: Uint8Array, mime: string) {
  const events: IntakeEvent[] = []
  const result = await runIntake(createModels({ DEMO_AI: 'mock' }), { name, bytes, mime }, (event) => events.push(event), TODAY)
  return { result, events }
}

const bySerial = (rows: IntakeRow[], serial: string) => rows.filter((row) => row.serial === serial)
const codes = (row: IntakeRow | undefined) => row?.flags.map((flag) => flag.code) ?? []

describe('readers', () => {
  it('reads both sheets of the messy workbook', () => {
    const sheets = readXlsx(xlsx)
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Oct repairs', 'how to fill this out'])
    expect(sheets[0].rows[2]).toContain('S/N')
  })

  it('finds the header under the title and skips totals', () => {
    const table = detectTable(readXlsx(xlsx)[0].rows)
    expect(table.headers.slice(0, 3)).toEqual(['Kid', 'S/N', 'Asset #'])
    expect(table.rows).toHaveLength(14)
    expect(table.rows[0].rowNumber).toBe(4)
    expect(table.skipped.map((skip) => skip.reason)).toContain('Totals row')
  })

  it('parses quoted CSV fields', () => {
    const rows = parseCsv(csv.toString())
    expect(rows[1][2]).toBe('Screen has a big crack, student dropped it in the hallway')
    expect(rows[6][2]).toBe('Hinge cracked, "it just broke" per student')
  })

  it('pulls pipe tables out of markdown', () => {
    const tables = parseMarkdownTables('## Sheet1\n| A | B |\n|---|---|\n| 1 | x \\| y |\n\ntext\n| C |\n| --- |\n| 2 |')
    expect(tables).toHaveLength(2)
    expect(tables[0]).toEqual({ title: 'Sheet1', rows: [['A', 'B'], ['1', 'x | y']] })
  })
})

describe('intake pipeline (mock models)', () => {
  it('maps columns and drops student names', async () => {
    const { result } = await intake('pinecrest-repairs-oct.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const kid = result.columns.find((column) => column.header === 'Kid')
    expect(kid).toMatchObject({ kind: 'student_name', dropped: true })
    expect(result.columns.find((column) => column.header === 'S/N')?.kind).toBe('serial_number')
    for (const row of result.rows) expect(Object.keys(row.raw)).not.toContain('Kid')
    expect(result.sheetName).toBe('Oct repairs')
  })

  it('flags every planted problem in the workbook', async () => {
    const { result, events } = await intake('pinecrest-repairs-oct.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const rows = result.rows
    expect(rows).toHaveLength(14)
    expect(events.filter((event) => event.type === 'row').map((event) => (event as { row: IntakeRow }).row.rowNumber)).toEqual(rows.map((row) => row.rowNumber))

    const [first, duplicate] = bySerial(rows, 'PF3XK2L9')
    expect(first.route).toBe('warranty')
    expect(first.include).toBe(true)
    expect(codes(duplicate)).toContain('duplicate')
    expect(duplicate.include).toBe(false)

    expect(bySerial(rows, 'PF2ZQ8K4')[0].route).toBe('oem')
    const typo = bySerial(rows, 'PF3XK2N7')[0]
    expect(codes(typo)).toContain('unknown_serial')
    expect(typo.suggestion?.serial).toBe('PF3XK2N1')

    const thrown = bySerial(rows, '5CD2341KPQ')[0]
    expect(thrown.route).toBe('break_fix')
    expect(codes(thrown)).toContain('likely_denied_intentional')

    expect(codes(bySerial(rows, 'PF3XK2P5')[0])).toContain('likely_denied_no_case')
    expect(codes(bySerial(rows, 'PF3XK2Q2')[0])).toContain('needs_description')
    expect(codes(bySerial(rows, 'PF3XK2R8')[0])).toContain('ber_risk')
    expect(bySerial(rows, 'C02FK3XYQ6L4')[0].route).toBe('none')

    const poBox = bySerial(rows, 'PF3XK2S3')[0]
    expect(codes(poBox)).toContain('po_box')
    expect(poBox.include).toBe(false)

    expect(bySerial(rows, '5CD2341KR2')[0].route).toBe('break_fix')
    expect(bySerial(rows, 'PF3XK2T6')[0].route).toBe('not_repair')
    expect(bySerial(rows, 'PF4AB7T2')[0].fields.incidentDate.value).toBe('2026-10-22')
  })

  it('reads the CSV, including a PO box hidden in the notes', async () => {
    const { result } = await intake('pinecrest-repairs.csv', new Uint8Array(csv), 'text/csv')
    expect(result.rows).toHaveLength(6)
    expect(codes(bySerial(result.rows, 'PF4AB7X8')[0])).toContain('po_box')
    expect(bySerial(result.rows, 'PF2ZQ8L6')[0].route).toBe('oem')
    expect(codes(bySerial(result.rows, 'PF4AB7W1')[0])).toContain('needs_description')
    expect(result.stages.map((stage) => stage.id)).toEqual(['read', 'columns', 'extract', 'decide', 'rules'])
  })
})

describe('screenshots (mock models, recorded transcripts)', () => {
  const png = new Uint8Array(readFileSync(new URL('../public/samples/repair-list-screenshot.png', import.meta.url)))
  // What Llama 4 Scout returned for the sample screenshot, and for a screenshot of a teacher's email.
  const SHEET = [
    'Ridgeview repairs - week of 10/20  Last edit was 2 minutes ago',
    '',
    '| Asset      | Serial     | Issue                                    | Date    | Room    |',
    '|------------|------------|------------------------------------------|---------|---------|',
    '| PVH-10451  | PF4AB7U9   | screen cracked, dropped in hallway (was in case) | 10/20   | Rm 12   |',
    "| PVH-30026  | 5CD2341KS7 | trackpad won't click                     | 10/21   | Rm 7    |",
    '| PVH-10378  | PF2ZQ8L6   | stopped charging, no damage              | 10/22   | Rm 7    |',
    '| PVH-10452  | PF4AB7V3   | water spilled on it, wont turn on        | 10/22   | Library |',
  ].join('\n')
  const EMAIL = [
    'From: Ms. Alvarez',
    'Subject: two chromebooks for repair',
    '',
    'Hi, two more for this week:',
    '- PF4AB7W1 (asset PVH-10460) keyboard missing keys, was in the case',
    "- 5CD2341KS7 trackpad still won't click after the reset",
    'Please send the box to the front office. Thanks!',
  ].join('\n')

  const screenshot = (text: string | null) =>
    runIntake(
      { ...createModels({ DEMO_AI: 'mock' }), transcribe: async () => (text ? { text, inputTokens: 1651, outputTokens: 187 } : null) },
      { name: 'repair-list-screenshot.png', bytes: png, mime: 'image/png' },
      () => {},
      TODAY
    )

  it('reads a transcribed table like a spreadsheet and counts the transcription', async () => {
    const result = await screenshot(SHEET)
    expect(result.columns.map((column) => column.header)).toEqual(['Asset', 'Serial', 'Issue', 'Date', 'Room'])
    expect(result.rows.map((row) => row.serial)).toEqual(['PF4AB7U9', '5CD2341KS7', 'PF2ZQ8L6', 'PF4AB7V3'])
    expect(result.stages[0]).toMatchObject({ id: 'read', model: VISION_MODEL, calls: 1, inputTokens: 1651 })
  })

  it('reads a transcribed email as free text', async () => {
    const result = await screenshot(EMAIL)
    expect(result.columns).toEqual([])
    expect(result.rows.map((row) => row.serial)).toEqual(['PF4AB7W1', '5CD2341KS7'])
  })
})
