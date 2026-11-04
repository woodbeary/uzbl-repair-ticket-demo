// Intake pipeline: read the file -> Clef maps the columns -> per row, Clairic extracts the fields
// while Clef makes the decisions -> deterministic pre-check rules. Progress streams to the UI.
import { CAUSE, COLUMN_KINDS, DAMAGE, IN_CASE } from '../../shared/labels'
import { INITIAL_CREDITS, INVENTORY } from '../../shared/inventory'
import { evaluateRow, type RuleContext } from '../../shared/rules'
import { normalizeSerial } from '../../shared/text'
import type {
  Cause,
  ColumnKind,
  ColumnMapping,
  Credits,
  Damage,
  Extracted,
  InCase,
  IntakeEvent,
  IntakeResult,
  IntakeRow,
  RowDecisions,
  RowFields,
  StageTiming,
} from '../../shared/types'
import { mockClairic, mockClef } from '../ai/mock'
import {
  CLAIRIC_MODEL,
  CLEF_MODEL,
  VISION_MODEL,
  choiceOf,
  noulOf,
  type ClairicAnswer,
  type ClairicField,
  type ClairicRequest,
  type ClairicResponse,
  type ClefQuestion,
  type ClefResponse,
  type Models,
} from '../ai/models'
import { parseCsv } from './csv'
import { parseMarkdownTables } from './markdown'
import { bestTable, type DetectedTable } from './table'
import { readXlsx } from './xlsx'

export const MAX_ROWS = 60
const CONCURRENCY = 6

export interface IntakeFile {
  name: string
  bytes: Uint8Array
  mime: string
}

interface Freeform {
  text?: string
  images?: { content_type: string; base64: string }[]
}

interface RowSource {
  rowNumber: number
  raw: Record<string, string>
  cells: string[]
  state: string
  images?: Freeform['images']
  anchorSerial?: string
}

type Emit = (event: IntakeEvent) => void

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function todayLine(today: string): string {
  const date = new Date(`${today}T12:00:00Z`)
  return `Today is ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.`
}

/** Runs a live model call, falling back to the keyword stand-in if it fails, and times it. */
async function call<T>(live: () => Promise<T>, backup: () => T) {
  const started = Date.now()
  try {
    return { result: await live(), fallback: false, ms: Date.now() - started }
  } catch (error) {
    console.warn('Model call failed, using backup rules', error)
    return { result: backup(), fallback: true, ms: Date.now() - started }
  }
}

async function readInput(models: Models, file: IntakeFile) {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const text = () => new TextDecoder().decode(file.bytes)

  if (ext === 'csv' || file.mime === 'text/csv') {
    const table = bestTable([{ grid: parseCsv(text()), name: null }])
    return { source: 'CSV file', sheetName: null, table: table?.table ?? null, usedMarkdown: false }
  }
  if (ext === 'xlsx' || ext === 'xlsm') {
    try {
      const sheets = readXlsx(file.bytes)
      const best = bestTable(sheets.map((sheet) => ({ grid: sheet.rows, name: sheet.name })))
      if (best && best.table.rows.length) {
        const source = `Excel workbook, ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`
        return { source, sheetName: best.candidate.name, table: best.table, usedMarkdown: false }
      }
    } catch (error) {
      console.warn('Built-in xlsx reader failed, trying Markdown Conversion', error)
    }
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || file.mime.startsWith('image/')) {
    const contentType = file.mime.startsWith('image/') ? file.mime : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    const image = { content_type: contentType, base64: base64(file.bytes) }
    // A table in the transcript takes the spreadsheet path; other text is read like a pasted email.
    // Without a transcript, Clairic reads the image itself.
    const transcript = await models.transcribe(image).catch((error) => {
      console.warn('Screenshot transcription failed, Clairic will read the image', error)
      return null
    })
    if (transcript) {
      const best = bestTable(parseMarkdownTables(transcript.text).map((table) => ({ grid: table.rows, name: table.title })))
      if (best && best.table.rows.length) return { source: 'Screenshot', sheetName: null, table: best.table, usedMarkdown: false, transcript }
      return { source: 'Screenshot', sheetName: null, table: null, freeform: { text: transcript.text } as Freeform, usedMarkdown: false, transcript }
    }
    return { source: 'Screenshot', sheetName: null, table: null, freeform: { images: [image] } as Freeform, usedMarkdown: false }
  }
  if (ext === 'txt' || file.mime.startsWith('text/plain')) {
    return { source: 'Pasted text', sheetName: null, table: null, freeform: { text: text() } as Freeform, usedMarkdown: false }
  }

  const markdown = await models.toMarkdown(file.name, file.bytes, file.mime || 'application/octet-stream')
  if (!markdown) throw new Error(`Couldn't read ${file.name}. Try an Excel, CSV, PDF, Word file or a screenshot.`)
  const tables = parseMarkdownTables(markdown)
  const best = bestTable(tables.map((table) => ({ grid: table.rows, name: table.title })))
  if (best && best.table.rows.length >= 1) {
    return { source: 'Workers AI Markdown Conversion', sheetName: best.candidate.name, table: best.table, usedMarkdown: true }
  }
  return { source: 'Workers AI Markdown Conversion', sheetName: null, table: null, freeform: { text: markdown } as Freeform, usedMarkdown: true }
}

function columnQuestions(table: DetectedTable): Record<string, ClefQuestion> {
  const criteria = Object.fromEntries(Object.entries(COLUMN_KINDS).map(([kind, info]) => [kind, info.describe]))
  const questions: Record<string, ClefQuestion> = {}
  table.headers.slice(0, 64).forEach((header, index) => {
    const examples = table.rows.map((row) => row.cells[index]).filter(Boolean).slice(0, 3).map((value) => value.slice(0, 60))
    questions[`col_${index}`] = {
      type: 'choice',
      instructions: {
        question: "What kind of information is in this column of a school's device repair spreadsheet?",
        column_header: header,
        example_values: examples,
      },
      criteria,
    }
  })
  return questions
}

const ROW_QUESTIONS: Record<string, ClefQuestion> = {
  damage: {
    type: 'choice',
    instructions: 'What kind of damage or problem does this repair report describe?',
    criteria: Object.fromEntries(Object.entries(DAMAGE).map(([key, info]) => [key, info.describe])),
  },
  cause: {
    type: 'choice',
    instructions: 'How did the device get damaged?',
    criteria: Object.fromEntries(Object.entries(CAUSE).map(([key, info]) => [key, info.describe])),
  },
  in_case: {
    type: 'choice',
    instructions: 'Was the device in its protective case when it was damaged?',
    criteria: Object.fromEntries(Object.entries(IN_CASE).map(([key, info]) => [key, info.describe])),
  },
  // Asked next to "cause", a looser wording read as "does it say how it happened" and failed plain
  // defects like "trackpad won't click"; naming only symptoms failed "kid threw it". Either counts.
  complete: {
    type: 'noul',
    instructions: 'Does the report give any detail about the problem, rather than only saying it is broken?',
    criteria: {
      true: "Any specific detail: a symptom (a cracked screen, a trackpad that won't click, won't charge, a loose port) or how it happened (dropped, thrown, knocked off a counter, spilled on).",
      false: 'Only "broken", "doesn\'t work", "pls fix", or nothing at all.',
    },
  },
}

function rowFields(anchorSerial?: string): Record<string, ClairicField> {
  const only = anchorSerial ? `For the device with serial ${anchorSerial} only: ` : ''
  return {
    serial_number: { type: 'text', instructions: `${only}The device serial number (S/N), not the asset tag` },
    asset_tag: { type: 'text', instructions: `${only}The district asset tag or inventory number` },
    device_model: { type: 'text', instructions: `${only}The device make and model` },
    what_happened: { type: 'text', instructions: `${only}What happened to the device or what is wrong with it, in the reporter's words` },
    incident_date: { type: 'date', instructions: `${only}When the damage happened or was reported` },
    location: { type: 'text', instructions: `${only}Where it happened, such as a room, the bus or home` },
    ship_to: { type: 'text', instructions: `${only}A shipping or return address, if one is given` },
  }
}

function extracted(answer: ClairicAnswer | undefined): Extracted {
  if (!answer || answer.value === null || answer.value === undefined || answer.value === '') return { value: null, confidence: answer?.confidence ?? 0 }
  return { value: String(answer.value).trim(), confidence: answer.confidence ?? 1 - (answer.p_null ?? 0) }
}

function decisions(response: ClefResponse): RowDecisions {
  const damage = choiceOf(response.answers.damage)
  const cause = choiceOf(response.answers.cause)
  const inCase = choiceOf(response.answers.in_case)
  return {
    damage: { value: (damage?.value ?? 'other') as Damage, confidence: damage?.confidence ?? 0 },
    cause: { value: (cause?.value ?? 'unknown') as Cause, confidence: cause?.confidence ?? 0 },
    inCase: { value: (inCase?.value ?? 'unknown') as InCase, confidence: inCase?.confidence ?? 0 },
    complete: noulOf(response.answers.complete) ?? 0,
  }
}

function stage(id: StageTiming['id'], label: string, detail: string, model: string | null, ms: number, calls = 0, inputTokens = 0, fallback = false): StageTiming {
  return { id, label, detail, model, ms, calls, inputTokens, fallback }
}

/** The read stage, counting the screenshot transcription's call and tokens when there was one. */
function readStage(input: Awaited<ReturnType<typeof readInput>>, detail: string, ms: number): StageTiming {
  const { transcript } = input
  if (!transcript) return stage('read', 'Read your file', detail, input.usedMarkdown ? 'Workers AI Markdown Conversion' : null, ms)
  return stage('read', 'Read your file', detail, VISION_MODEL, ms, 1, transcript.inputTokens)
}

export async function runIntake(models: Models, file: IntakeFile, emit: Emit, today: string, credits: Credits = INITIAL_CREDITS): Promise<IntakeResult> {
  const stages: StageTiming[] = []
  const done = (timing: StageTiming) => {
    stages.push(timing)
    emit({ type: 'stage', id: timing.id, status: 'done', label: timing.label, detail: timing.detail, timing })
  }

  // 1. Read
  emit({ type: 'stage', id: 'read', status: 'start', label: 'Reading your file' })
  let started = Date.now()
  const input = await readInput(models, file)
  let sources: RowSource[] = []
  let columns: ColumnMapping[] = []
  const skippedRows = [...(input.table?.skipped ?? [])]
  let freeformStage: StageTiming | null = null

  if (input.table) {
    done(readStage(input, `${input.source}${input.sheetName ? `, picked sheet "${input.sheetName}"` : ''}: found the header row and ${input.table.rows.length} device rows`, Date.now() - started))

    // 2. Columns (Clef)
    emit({ type: 'stage', id: 'columns', status: 'start', label: 'Understanding your columns' })
    const table = input.table
    const summary = `A school district's spreadsheet of devices that need repair ("${file.name}"${input.sheetName ? `, sheet "${input.sheetName}"` : ''}), ${table.rows.length} rows.`
    const questions = columnQuestions(table)
    const colCall = await call(() => models.clef(summary, questions), () => mockClef(summary, questions))
    columns = table.headers.map((header, index) => {
      const answer = choiceOf(colCall.result.answers[`col_${index}`])
      const hasValues = table.rows.some((row) => row.cells[index])
      const kind = (hasValues ? answer?.value ?? 'ignore' : 'ignore') as ColumnKind
      return { index, header, kind, confidence: answer?.confidence ?? 0, dropped: kind === 'student_name' }
    })
    const dropped = columns.filter((column) => column.dropped)
    done(
      stage(
        'columns',
        'Understood your columns',
        `${columns.filter((c) => c.kind !== 'ignore').length} columns mapped${dropped.length ? `; removed ${dropped.map((c) => `"${c.header}"`).join(', ')} (student names)` : ''}`,
        models.mode === 'live' ? CLEF_MODEL : null,
        colCall.ms,
        1,
        colCall.result.usage?.input_tokens ?? 0,
        colCall.fallback
      )
    )
    emit({ type: 'columns', columns, sheetName: input.sheetName, rowCount: table.rows.length })

    const kept = columns.filter((column) => !column.dropped && column.kind !== 'ignore')
    sources = table.rows.map((row) => {
      const raw: Record<string, string> = {}
      const lines = [todayLine(today), 'Device repair report from a school spreadsheet:']
      for (const column of kept) {
        const value = row.cells[column.index]
        raw[column.header] = value
        if (value) lines.push(`${column.header}: ${value}`)
      }
      return { rowNumber: row.rowNumber, raw, cells: kept.map((column) => row.cells[column.index]).filter(Boolean), state: lines.join('\n') }
    })
  } else {
    done(readStage(input, `${input.source}: no table, so reading it like a person would`, Date.now() - started))
    emit({ type: 'stage', id: 'columns', status: 'start', label: 'Finding the devices' })
    const freeform = input.freeform ?? {}
    const request: ClairicRequest = {
      state: freeform.text ?? '',
      images: freeform.images,
      fields: {
        serials: { type: 'list', items: 'text', instructions: 'Every device serial number, top to bottom. Serials look like PF3XK2L9 or 5CD2341KPQ; asset tags like PVH-10432 are not serials.' },
      },
      reference_date: today,
      options: { return_state_text: true },
    }
    const found = await call(() => models.clairic(request), () => mockClairic(request))
    const serials = [...new Set(((found.result.answers.serials?.value as string[] | undefined) ?? []).map(normalizeSerial).filter(Boolean))]
    const stateText = found.result.state_text || freeform.text || ''
    const lines = stateText.split('\n')
    sources = serials.map((serial, i) => {
      const line = lines.find((candidate) => normalizeSerial(candidate).includes(serial)) ?? serial
      return {
        rowNumber: i + 1,
        raw: { Serial: serial, Line: line.trim().slice(0, 160) },
        cells: [line],
        state: stateText ? `${todayLine(today)}\n${stateText}` : todayLine(today),
        images: stateText ? undefined : freeform.images,
        anchorSerial: serial,
      }
    })
    freeformStage = stage('columns', 'Found the devices', `${serials.length} serial numbers found`, models.mode === 'live' ? CLAIRIC_MODEL : null, found.ms, 1, found.result.usage?.input_tokens ?? 0, found.fallback)
    done(freeformStage)
    emit({ type: 'columns', columns: [], sheetName: null, rowCount: serials.length })
  }

  if (sources.length > MAX_ROWS) {
    for (const source of sources.slice(MAX_ROWS)) skippedRows.push({ rowNumber: source.rowNumber, reason: `Over the ${MAX_ROWS}-row demo limit` })
    sources = sources.slice(0, MAX_ROWS)
  }
  if (!sources.length) throw new Error("We couldn't find any devices in that file.")

  // 3. Per row: Clairic extracts while Clef decides; rules run in row order as results land.
  emit({ type: 'stage', id: 'extract', status: 'start', label: 'Extracting device details' })
  emit({ type: 'stage', id: 'decide', status: 'start', label: 'Deciding damage, cause and coverage' })
  started = Date.now()
  const ctx: RuleContext = { inventory: INVENTORY, credits, seenSerials: new Map() }
  const results: (IntakeRow | undefined)[] = new Array(sources.length)
  const pending: (Promise<void> | undefined)[] = []
  let extractTokens = 0
  let decideTokens = 0
  let extractFallback = false
  let decideFallback = false
  let flushed = 0
  const finished: ({ fields: RowFields; decisions: RowDecisions; fallback: boolean } | undefined)[] = new Array(sources.length)

  const flush = () => {
    while (flushed < sources.length && finished[flushed]) {
      const source = sources[flushed]
      const { fields, decisions: rowDecisions, fallback } = finished[flushed]!
      const rowInput = { rowNumber: source.rowNumber, fields, decisions: rowDecisions, cells: source.cells }
      const verdict = evaluateRow(rowInput, ctx)
      if (verdict.flags.some((flag) => flag.code === 'duplicate')) verdict.include = false
      const row: IntakeRow = { ...rowInput, ...verdict, raw: source.raw, aiSource: fallback ? 'backup-rules' : 'models' }
      results[flushed] = row
      emit({ type: 'row', row })
      flushed++
    }
  }

  const work = async (index: number) => {
    const source = sources[index]
    const request: ClairicRequest = { state: source.state, images: source.images, fields: rowFields(source.anchorSerial), reference_date: today }
    const [ex, de] = await Promise.all([
      call(() => models.clairic(request), () => mockClairic({ ...request, images: undefined })),
      call(() => models.clef(source.state, ROW_QUESTIONS), () => mockClef(source.state, ROW_QUESTIONS)),
    ])
    extractTokens += ex.result.usage?.input_tokens ?? 0
    decideTokens += de.result.usage?.input_tokens ?? 0
    extractFallback ||= ex.fallback
    decideFallback ||= de.fallback
    const answers = (ex.result as ClairicResponse).answers
    const fields: RowFields = {
      serial: source.anchorSerial ? { value: source.anchorSerial, confidence: 0.95 } : extracted(answers.serial_number),
      assetTag: extracted(answers.asset_tag),
      model: extracted(answers.device_model),
      whatHappened: extracted(answers.what_happened),
      incidentDate: extracted(answers.incident_date),
      location: extracted(answers.location),
      shipTo: extracted(answers.ship_to),
    }
    finished[index] = { fields, decisions: decisions(de.result as ClefResponse), fallback: ex.fallback || de.fallback }
    flush()
  }

  let next = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, sources.length) }, async () => {
    while (next < sources.length) {
      const index = next++
      pending[index] = work(index)
      await pending[index]
    }
  })
  await Promise.all(runners)
  const elapsed = Date.now() - started
  const live = models.mode === 'live'
  done(stage('extract', 'Extracted device details', `Serial, model, what happened, when, where and ship-to for ${sources.length} devices`, live ? CLAIRIC_MODEL : null, elapsed, sources.length, extractTokens, extractFallback))
  done(stage('decide', 'Decided damage, cause and coverage', `Damage type, accident vs. defect vs. intentional, and in-case for ${sources.length} devices`, live ? CLEF_MODEL : null, elapsed, sources.length, decideTokens, decideFallback))

  // 4. Rules already ran per row; report them as their own step.
  emit({ type: 'stage', id: 'rules', status: 'start', label: 'Pre-checking before anything is sent' })
  const rows = results.filter((row): row is IntakeRow => !!row)
  const blocked = rows.filter((row) => row.flags.some((flag) => flag.level === 'block')).length
  const warned = rows.filter((row) => row.flags.some((flag) => flag.level === 'warn')).length
  done(stage('rules', 'Pre-checked every device', `${rows.filter((row) => row.include).length} ready, ${warned} with a heads-up, ${blocked} need a fix first`, null, 1))

  return {
    fileName: file.name,
    sheetName: input.sheetName,
    source: input.source,
    columns,
    rows,
    skippedRows,
    stages,
    inventory: INVENTORY,
    credits,
    today,
  }
}
