// Turns an intake result plus the school's taps into the rows to submit and the short queue of
// questions to ask, one at a time. Rules are the same shared ones the server ran.
import type { IntakeResult, IntakeRow, Program, RowInput } from '@/shared/types'
import { evaluateRows, isProgram } from '@/shared/rules'

export interface Edit {
  serial?: string
  whatHappened?: string
  shipTo?: string
  include?: boolean
  route?: Program
}

export type IssueKind = 'po_box' | 'unknown_serial' | 'no_serial' | 'needs_description' | 'likely_denied' | 'not_covered'

export interface Issue {
  key: string
  kind: IssueKind
  rows: IntakeRow[]
}

const DENIAL_CODES = new Set(['likely_denied_intentional', 'likely_denied_no_case', 'likely_denied_defect', 'oem_accident'])

function applyEdit(row: IntakeRow, edit: Edit | undefined): RowInput {
  if (!edit) return row
  const fields = { ...row.fields }
  const decisions = { ...row.decisions }
  if (edit.serial !== undefined) fields.serial = { value: edit.serial, confidence: 1 }
  if (edit.whatHappened !== undefined) {
    fields.whatHappened = { value: edit.whatHappened, confidence: 1 }
    decisions.complete = edit.whatHappened.trim().length >= 8 ? 1 : 0
  }
  if (edit.shipTo !== undefined) fields.shipTo = { value: edit.shipTo, confidence: 1 }
  return { rowNumber: row.rowNumber, fields, decisions, cells: row.cells }
}

export function reviewedRows(result: IntakeResult, edits: Record<number, Edit>): IntakeRow[] {
  const inputs = result.rows.map((row) => applyEdit(row, edits[row.rowNumber]))
  const verdicts = evaluateRows(inputs, result.inventory, result.credits)
  return result.rows.map((row, i) => {
    const edit = edits[row.rowNumber]
    const verdict = verdicts[i]
    const blocked = verdict.flags.some((flag) => flag.level === 'block')
    const duplicate = verdict.flags.some((flag) => flag.code === 'duplicate')
    const route = edit?.route ?? verdict.route
    const wanted = edit?.include ?? (edit?.route ? true : verdict.include)
    const include = !blocked && !duplicate && isProgram(route) && wanted
    return { ...row, ...inputs[i], ...verdict, route, include }
  })
}

const has = (row: IntakeRow, code: string) => row.flags.some((flag) => flag.code === code)

export function openIssues(rows: IntakeRow[], edits: Record<number, Edit>, resolved: Set<string>): Issue[] {
  const live = rows.filter((row) => edits[row.rowNumber]?.include !== false && !has(row, 'duplicate'))
  const issues: Issue[] = []
  const group = (kind: IssueKind, match: (row: IntakeRow) => boolean) => {
    const matched = live.filter(match)
    if (matched.length && !resolved.has(kind)) issues.push({ key: kind, kind, rows: matched })
  }
  const each = (kind: IssueKind, match: (row: IntakeRow) => boolean) => {
    for (const row of live.filter(match)) {
      const key = `${kind}:${row.rowNumber}`
      if (!resolved.has(key)) issues.push({ key, kind, rows: [row] })
    }
  }

  group('po_box', (row) => has(row, 'po_box'))
  each('unknown_serial', (row) => has(row, 'unknown_serial'))
  each('no_serial', (row) => has(row, 'no_serial'))
  each('needs_description', (row) => has(row, 'needs_description') && !has(row, 'unknown_serial'))
  group('likely_denied', (row) => row.flags.some((flag) => DENIAL_CODES.has(flag.code)) && !edits[row.rowNumber]?.route)
  group('not_covered', (row) => has(row, 'not_covered') && !edits[row.rowNumber]?.route)
  return issues
}

export function summarize(rows: IntakeRow[]) {
  const ready = rows.filter((row) => row.include)
  const byRoute = { warranty: 0, oem: 0, break_fix: 0 }
  for (const row of ready) if (isProgram(row.route)) byRoute[row.route]++
  return {
    ready,
    byRoute,
    duplicates: rows.filter((row) => has(row, 'duplicate')).length,
    lost: rows.filter((row) => row.route === 'not_repair').length,
    leftOut: rows.filter((row) => !row.include && !has(row, 'duplicate') && row.route !== 'not_repair').length,
    berRisk: ready.filter((row) => has(row, 'ber_risk')).length,
  }
}
