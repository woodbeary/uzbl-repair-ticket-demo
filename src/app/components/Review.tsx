'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Barcode,
  Check,
  CircleAlert,
  CircleCheck,
  Coins,
  Gauge,
  Laptop,
  Layers,
  List,
  MapPin,
  MapPinOff,
  MessageSquareText,
  RotateCcw,
  ScanBarcode,
  Send,
  ShieldAlert,
  ShieldMinus,
  Wrench,
} from 'lucide-react'
import type { IntakeResult, IntakeRow, Program } from '@/shared/types'
import { SCHOOL } from '@/shared/inventory'
import { creditsLeft, creditsNeeded } from '@/shared/rules'
import type { Edit, Issue } from '../lib/review'
import { summarize } from '../lib/review'
import { FLAG_SHORT, PROGRAM_ICON, PROGRAM_SHORT, cx, shortModel } from '../lib/ui'
import { Action, Chip, IconBadge, type BadgeTone } from './Bits'
import { SuggestedAddress, Suggestion, boxOnly } from './Suggestion'

interface Props {
  result: IntakeResult
  rows: IntakeRow[]
  issues: Issue[]
  totalIssues: number
  submitting: boolean
  error: string | null
  onEdit: (rowNumber: number, patch: Edit) => void
  onResolve: (key: string) => void
  onSubmit: () => void
  onRestart: () => void
  onOpen: (sheet: 'list' | 'hood') => void
}

const ISSUE: Record<Issue['kind'], { icon: LucideIcon; tone: BadgeTone }> = {
  po_box: { icon: MapPinOff, tone: 'bad' },
  unknown_serial: { icon: ScanBarcode, tone: 'warn' },
  no_serial: { icon: Barcode, tone: 'bad' },
  needs_description: { icon: MessageSquareText, tone: 'warn' },
  likely_denied: { icon: ShieldAlert, tone: 'warn' },
  not_covered: { icon: ShieldMinus, tone: 'neutral' },
}

/** The PO box as the file has it: the ship-to that was read, or just the box from the note it hid in. */
function poBox(row: IntakeRow): string {
  const shipTo = row.fields.shipTo.value
  if (shipTo && /box/i.test(shipTo)) return shipTo
  const text = row.cells.find((cell) => /box/i.test(cell)) ?? 'PO Box'
  return text.match(/p\.?\s*o\.?\s*box\s*\d+/i)?.[0] ?? text
}

function Stat({ icon: Icon, value, label, alert }: { icon: LucideIcon; value: number; label: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl bg-fill px-2 py-2.5 text-center">
      <p className={cx('flex items-center justify-center gap-1.5 text-[24px] font-semibold leading-none tabular-nums', alert && value > 0 && 'text-bad')}>
        <Icon className="size-[18px]" aria-hidden strokeWidth={2.4} />
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-3">{label}</p>
    </div>
  )
}

/** One device on a single line: serial, model, and whatever chip explains it. */
function RowLine({ row, chip }: { row: IntakeRow; chip?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-2xl bg-fill px-4">
      <span className="shrink-0 font-mono text-[13px]">{row.serial || '—'}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{shortModel(row.device?.model ?? row.fields.model.value)}</span>
      {chip}
    </div>
  )
}

function Rows({ rows, chip }: { rows: IntakeRow[]; chip?: (row: IntakeRow) => React.ReactNode }) {
  const shown = rows.slice(0, 3)
  return (
    <>
      {shown.map((row) => (
        <RowLine key={row.rowNumber} row={row} chip={chip?.(row)} />
      ))}
      {rows.length > shown.length && <p className="text-center text-[13px] text-fg-3">+{rows.length - shown.length}</p>}
    </>
  )
}

function IssueCard({ issue, credits, onEdit, onResolve }: { issue: Issue; credits: IntakeResult['credits']; onEdit: Props['onEdit']; onResolve: Props['onResolve'] }) {
  const [text, setText] = useState('')
  const { icon, tone } = ISSUE[issue.kind]
  const rows = issue.rows
  const row = rows[0]
  const skip = () => {
    for (const each of rows) onEdit(each.rowNumber, { include: false })
    onResolve(issue.key)
  }
  const many = rows.length > 1

  let title: string
  let body: React.ReactNode
  let actions: React.ReactNode
  switch (issue.kind) {
    case 'po_box':
      title = many ? 'Can’t ship to PO boxes' : 'Can’t ship to a PO box'
      body = <SuggestedAddress poBox={boxOnly(poBox(row)) + (many ? ` +${rows.length - 1}` : '')} address={SCHOOL.address} />
      actions = (
        <>
          <Action primary icon={MapPin} onClick={() => rows.forEach((r) => onEdit(r.rowNumber, { shipTo: SCHOOL.address }))}>
            Use this address
          </Action>
          <Action onClick={skip}>Skip</Action>
        </>
      )
      break
    case 'unknown_serial': {
      const match = row.suggestion
      const typed = row.fields.serial.value ?? row.serial
      title = 'Serial not found'
      body = match ? (
        <Suggestion old={typed} icon={Laptop} title={match.serial} detail={`${shortModel(match.model)} · ${match.assetTag}`} mono />
      ) : (
        <p className="text-center font-mono text-[15px] text-fg-3">{typed}</p>
      )
      actions = (
        <>
          {match && (
            <Action primary icon={Check} onClick={() => onEdit(row.rowNumber, { serial: match.serial })}>
              Use this serial
            </Action>
          )}
          <Action onClick={skip}>Skip</Action>
        </>
      )
      break
    }
    case 'no_serial':
      title = 'Serial missing'
      body = <p className="truncate text-center text-[15px] text-fg-2">{row.fields.whatHappened.value ?? `Row ${row.rowNumber}`}</p>
      actions = <Action onClick={skip}>Skip</Action>
      break
    case 'needs_description': {
      const ok = text.trim().length >= 8
      const add = () => ok && onEdit(row.rowNumber, { whatHappened: text.trim() })
      title = 'What happened?'
      body = (
        <>
          <p className="truncate text-center text-[15px] text-fg-2">
            <span className="font-mono">{row.serial}</span> · {shortModel(row.device?.model ?? row.fields.model.value)}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Dropped, screen cracked"
              aria-label="What happened"
              enterKeyHint="done"
              className="h-12 w-full rounded-full border border-line bg-bg px-5 text-[17px] outline-none placeholder:text-fg-3 focus:border-fg-3"
            />
          </form>
        </>
      )
      actions = (
        <>
          <Action primary icon={Check} onClick={add} disabled={!ok}>
            Add
          </Action>
          <Action onClick={skip}>Skip</Action>
        </>
      )
      break
    }
    case 'likely_denied': {
      const reason = (r: IntakeRow) => {
        const flag = r.flags.find((candidate) => candidate.code.startsWith('likely_denied') || candidate.code === 'oem_accident')
        return flag ? FLAG_SHORT[flag.code] : undefined
      }
      const fileAnyway = () => {
        for (const r of rows) onEdit(r.rowNumber, { route: (r.device?.coverage === 'oem' ? 'oem' : 'warranty') as Program })
        onResolve(issue.key)
      }
      title = many ? `${rows.length} likely denied` : 'Likely denied'
      body = (
        <>
          <Rows
            rows={rows}
            chip={(r) => {
              const why = reason(r)
              return why ? (
                <Chip icon={why.icon} tone="warn">
                  {why.label}
                </Chip>
              ) : null
            }}
          />
        </>
      )
      actions = (
        <>
          <Action primary icon={Wrench} onClick={() => onResolve(issue.key)}>
            Use Break-Fix
          </Action>
          <Action onClick={fileAnyway}>File anyway</Action>
        </>
      )
      break
    }
    case 'not_covered':
      title = 'No coverage'
      body = (
        <>
          <Rows rows={rows} />
          <p className="pt-1 text-center text-[13px] text-fg-3">{creditsLeft(credits, 'touch') + creditsLeft(credits, 'non_touch')} credits left</p>
        </>
      )
      actions = (
        <>
          <Action
            primary
            icon={Coins}
            onClick={() => {
              for (const r of rows) onEdit(r.rowNumber, { route: 'break_fix' })
              onResolve(issue.key)
            }}
          >
            Use {many ? 'credits' : 'a credit'}
          </Action>
          <Action onClick={skip}>Skip</Action>
        </>
      )
      break
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="animate-enter flex min-h-0 flex-1 flex-col items-center justify-center pb-6">
        <IconBadge icon={icon} tone={tone} size="lg" className="[@media(max-height:600px)]:hidden" />
        <h2 className="mt-4 text-center [@media(max-height:600px)]:mt-0 text-[26px] font-semibold leading-tight tracking-[-0.02em] [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:text-[22px]">{title}</h2>
        <div className="mt-5 w-full space-y-2 [@media(max-height:720px)]:mt-3">{body}</div>
      </div>
      <div className="mt-3 space-y-1.5">{actions}</div>
    </div>
  )
}

function RouteTile({ program, count }: { program: Program; count: number }) {
  const Icon = PROGRAM_ICON[program]
  return (
    <div className={cx('rounded-2xl bg-fill py-3 text-center', !count && 'opacity-40')}>
      <Icon className="mx-auto size-5 text-fg-2" aria-hidden />
      <p className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums">{count}</p>
      <p className="mt-1 text-[11px] text-fg-3">{PROGRAM_SHORT[program]}</p>
    </div>
  )
}

function ReadyCard({ result, rows, submitting, error, onSubmit, onRestart }: Pick<Props, 'result' | 'rows' | 'submitting' | 'error' | 'onSubmit' | 'onRestart'>) {
  const summary = summarize(rows)
  const needed = creditsNeeded(rows)
  const left = { touch: creditsLeft(result.credits, 'touch'), non_touch: creditsLeft(result.credits, 'non_touch') }
  const short = needed.touch > left.touch || needed.non_touch > left.non_touch
  const credits = needed.touch + needed.non_touch
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="animate-enter flex min-h-0 flex-1 flex-col items-center justify-center pb-6">
        <IconBadge icon={Check} tone="inverse" size="lg" />
        <h2 className="mt-4 text-[30px] font-semibold leading-tight tracking-[-0.02em] tabular-nums [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:text-[24px]">
          {summary.ready.length} ready
        </h2>
        <div className="mt-5 grid w-full grid-cols-3 gap-2 [@media(max-height:720px)]:mt-3">
          {(['warranty', 'oem', 'break_fix'] as Program[]).map((program) => (
            <RouteTile key={program} program={program} count={summary.byRoute[program]} />
          ))}
        </div>
        <p className="mt-4 text-center text-[13px] text-fg-3">
          {(
            [
              summary.duplicates > 0 && { text: `${summary.duplicates} merged` },
              summary.lost > 0 && { text: `${summary.lost} lost` },
              summary.leftOut > 0 && { text: `${summary.leftOut} skipped` },
              summary.berRisk > 0 && { text: `${summary.berRisk} BER risk`, className: 'text-warn' },
              credits > 0 && { text: `${credits} credits`, className: short ? 'text-bad' : undefined, title: `${needed.touch} Touch and ${needed.non_touch} Non-Touch credits. ${left.touch} and ${left.non_touch} left.` },
            ].filter(Boolean) as { text: string; className?: string; title?: string }[]
          ).map((note, index) => (
            <span key={note.text} className={note.className} title={note.title}>
              {index > 0 && ' · '}
              {note.text}
            </span>
          ))}
        </p>
      </div>
      <div className="mt-3 space-y-1.5">
        {error && (
          <p className="flex h-5 items-center justify-center gap-1.5 text-[13px] text-bad" role="alert">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{error}</span>
          </p>
        )}
        <Action primary icon={Send} busy={submitting} disabled={!summary.ready.length || short} onClick={onSubmit}>
          Submit {summary.ready.length}
        </Action>
        <Action icon={RotateCcw} onClick={onRestart}>
          Start over
        </Action>
      </div>
    </div>
  )
}

export function Review({ result, rows, issues, totalIssues, submitting, error, onEdit, onResolve, onSubmit, onRestart, onOpen }: Props) {
  const summary = summarize(rows)
  const issue = issues[0]
  const step = totalIssues - issues.length + 1

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex h-full max-h-[44rem] w-full max-w-md flex-col px-5 pb-1 pt-1">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={Layers} value={rows.length} label="Found" />
          <Stat icon={CircleCheck} value={summary.ready.length} label="Ready" />
          <Stat icon={CircleAlert} value={issues.length} label="Need you" alert />
        </div>

        <div className="mt-5 flex h-1.5 items-center justify-center gap-1.5 [@media(max-height:720px)]:mt-4" aria-label={issue ? `Question ${step} of ${totalIssues}` : 'All answered'}>
          {Array.from({ length: totalIssues }, (_, i) => (
            <span key={i} className={cx('h-1.5 rounded-full transition-all', !issue || i < step - 1 ? 'w-1.5 bg-fg' : i === step - 1 ? 'w-5 bg-fg' : 'w-1.5 bg-fill-2')} />
          ))}
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col [@media(max-height:720px)]:mt-4">
          {issue ? (
            <IssueCard key={issue.key} issue={issue} credits={result.credits} onEdit={onEdit} onResolve={onResolve} />
          ) : (
            <ReadyCard result={result} rows={rows} submitting={submitting} error={error} onSubmit={onSubmit} onRestart={onRestart} />
          )}
        </div>

        <div className="mt-1 flex h-9 items-center justify-center gap-6 text-[13px] text-fg-3">
          <button onClick={() => onOpen('list')} className="inline-flex items-center gap-1.5 hover:text-fg">
            <List className="size-4" aria-hidden /> All {rows.length}
          </button>
          <button onClick={() => onOpen('hood')} className="inline-flex items-center gap-1.5 hover:text-fg">
            <Gauge className="size-4" aria-hidden /> Details
          </button>
        </div>
      </div>
    </div>
  )
}
