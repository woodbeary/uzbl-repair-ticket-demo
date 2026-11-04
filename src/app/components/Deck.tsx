'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  FastForward,
  FileText,
  History as HistoryIcon,
  Layers,
  Mail,
  MapPin,
  MapPinOff,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  Truck,
  Undo2,
  Wrench,
} from 'lucide-react'
import type { ClientTicket } from '@/shared/types'
import { STAGES, stageIndex } from '@/shared/stages'
import { looksLikePoBox } from '@/shared/text'
import { api } from '../lib/api'
import type { FindField } from '../lib/find'
import { PROGRAM_ICON, PROGRAM_SHORT, SOURCE_ICON, cx, relativeTime, shortModel, ticketDaysLeft, ticketHeadline, ticketIcon, ticketTone, type Tone } from '../lib/ui'
import { Action, Chip, Count, IconBadge, Skeleton, Spinner, type BadgeTone } from './Bits'
import { SuggestedAddress } from './Suggestion'

const OPTION_ICON: Record<string, LucideIcon> = { use_credit: Wrench, appeal: Undo2, repair: Wrench, payout: Banknote, replace: RefreshCw }
const TAG_ICON: Record<NonNullable<ClientTicket['attention']>['kind'], LucideIcon> = { address: MapPinOff, denied: ShieldOff, ber: RotateCcw }
const BADGE: Record<Tone, BadgeTone> = { ok: 'ok', bad: 'bad', warn: 'warn', live: 'neutral', idle: 'neutral' }

// Same outer geometry for the deck and its skeleton, so the first paint never shifts.
const SHELL = 'mx-auto flex h-full w-full max-w-md flex-col justify-center px-5 pb-1'
const RAIL = 'mt-3 flex h-[29rem] max-h-[calc(100%-6rem)] min-h-0 w-full'
const CARD = 'flex h-full w-full flex-col rounded-[28px] border border-line bg-fill p-5 [@media(max-height:720px)]:p-4'

/** Just-submitted repairs first, then whatever needs the school, then the rest. */
export function orderTickets(tickets: ClientTicket[], pinned: string[] = []): ClientTicket[] {
  const rank = (ticket: ClientTicket) => {
    const pin = pinned.indexOf(ticket.id)
    if (pin >= 0) return pin - pinned.length
    return ticket.attention ? 0 : ticket.closed || ticket.stage === 'cancelled' ? 2 : 1
  }
  return [...tickets].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-fill-2" aria-label={label} title={label}>
      <Icon className="size-[18px]" aria-hidden />
    </button>
  )
}

/** Copies an identifier for pasting into another system, with a brief check mark. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})}
      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-fill-2 hover:text-fg"
      aria-label={copied ? 'Copied' : label}
      title={label}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  )
}

/** The progress bar, with the status chip (or the step count) and the next step under it. */
function Track({ ticket, chip }: { ticket: ClientTicket; chip: React.ReactNode }) {
  const stages = STAGES[ticket.program]
  const denied = ticket.stage === 'cancelled'
  const current = denied ? 0 : stageIndex(ticket.program, ticket.stage)
  const finished = ticket.closed && !ticket.attention && !denied
  const next = stages[current + 1]
  return (
    <div className="mt-3 [@media(max-height:720px)]:mt-2.5">
      <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={stages.length} aria-valuenow={current + 1} aria-label="Repair progress">
        {stages.map((stage, index) => (
          <span
            key={stage.key}
            title={stage.label}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors duration-500',
              finished || index < current ? 'bg-fg' : index === current ? (ticket.attention?.kind === 'ber' ? 'bg-warn' : ticket.attention || denied ? 'bg-bad' : 'animate-breathe bg-fg') : 'bg-fill-2'
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex h-7 items-center justify-between gap-3 text-[12px] text-fg-3 tabular-nums">
        {/* A long chip shortens itself; the next step stays on one line. */}
        <span className="flex min-w-0">
          {chip ?? (
            <span>
              {finished ? stages.length : current + 1}/{stages.length}
            </span>
          )}
        </span>
        {!finished && next && (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
            <ArrowRight className="size-3" aria-label="Next" />
            {next.label}
          </span>
        )}
      </div>
    </div>
  )
}

function statusChip(ticket: ClientTicket): React.ReactNode {
  const attention = ticket.attention
  if (attention?.tag)
    return (
      <Chip icon={TAG_ICON[attention.kind]} tone={attention.kind === 'ber' ? 'warn' : 'bad'}>
        {attention.tag}
      </Chip>
    )
  const days = ticketDaysLeft(ticket)
  if (days)
    return (
      <span aria-label={`About ${days} days left`}>
        <Chip icon={Clock}>~{days}d</Chip>
      </span>
    )
  if (ticket.stage === 'cancelled') return <Chip icon={Undo2}>Appeal sent</Chip>
  if (ticket.closed)
    return (
      <Chip icon={CircleCheck} tone="ok">
        Done
      </Chip>
    )
  return null
}

function Decide({ ticket, busy, onAct }: { ticket: ClientTicket; busy: string | null; onAct: (id: string, run: () => Promise<{ ticket: ClientTicket }>) => void }) {
  const attention = ticket.attention!
  const suggested = attention.suggestedAddress ?? ''
  const [address, setAddress] = useState(suggested)
  const [editing, setEditing] = useState(!suggested)
  if (attention.kind === 'address') {
    // The street address we suggest, one button to use it; the pencil is there for a different one.
    if (!editing)
      return (
        <div className="space-y-2">
          <SuggestedAddress address={suggested} onEdit={() => setEditing(true)} />
          <Action primary icon={MapPin} busy={busy === 'address'} disabled={!!busy} onClick={() => onAct('address', () => api.fixAddress(ticket.id, suggested))}>
            Use this address
          </Action>
        </div>
      )
    const bad = looksLikePoBox(address) || address.trim().length < 10
    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!bad) onAct('address', () => api.fixAddress(ticket.id, address))
        }}
      >
        <textarea
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          rows={2}
          autoFocus={!!suggested}
          aria-label="Street address"
          autoComplete="street-address"
          className="block w-full resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-[16px] leading-snug outline-none focus:border-fg-3"
        />
        <div className="flex gap-2">
          <Action primary type="submit" icon={MapPin} busy={busy === 'address'} disabled={bad || !!busy}>
            Use this address
          </Action>
          {suggested && (
            <button type="button" onClick={() => setEditing(false)} className="h-12 shrink-0 rounded-full bg-fill px-5 text-[15px] font-semibold hover:bg-fill-2 [@media(max-height:720px)]:h-11">
              Cancel
            </button>
          )}
        </div>
      </form>
    )
  }
  return (
    <div className="space-y-2">
      {attention.options?.map((option) => (
        <Action
          key={option.id}
          primary={option.primary}
          icon={OPTION_ICON[option.id]}
          busy={busy === option.id}
          disabled={!!busy}
          onClick={() => onAct(option.id, () => api.decide(ticket.id, option.id))}
        >
          {option.label}
        </Action>
      ))}
    </div>
  )
}

/** The newest update, in one quiet line under the tracker; a new one slides in when it arrives. */
function Latest({ ticket }: { ticket: ClientTicket }) {
  const event = ticket.events[ticket.events.length - 1]
  if (!event) return null
  const Icon = event.kind === 'problem' ? CircleAlert : event.kind === 'resolved' ? CircleCheck : SOURCE_ICON[event.source]
  return (
    <p key={event.at + event.title} className="animate-slot mt-3 flex h-8 items-center gap-2.5 text-fg-2" aria-label="Latest update">
      <Icon className="size-4 shrink-0" aria-label={event.source} />
      <span className="min-w-0 flex-1 truncate text-[14px]">{event.title}</span>
      <time className="shrink-0 text-[12px] tabular-nums text-fg-3" dateTime={event.at}>
        {relativeTime(event.at)}
      </time>
    </p>
  )
}


function TrackerCard({
  ticket,
  matched,
  onUpdate,
  onOpen,
}: {
  ticket: ClientTicket
  /** The identifier a quick find matched on this repair, marked so the eye lands on it. */
  matched?: FindField | null
  onUpdate: (ticket: ClientTicket) => void
  onOpen: (sheet: 'history' | 'email', id: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tone = ticketTone(ticket)
  const StatusIcon = ticketIcon(ticket)
  const ProgramIcon = PROGRAM_ICON[ticket.program]
  const canAdvance = !ticket.attention && !ticket.closed && ticket.remaining > 0
  const mark = (field: FindField) => (matched === field ? '-mx-1 rounded-md bg-fill-2 px-1 ring-1 ring-line' : undefined)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  async function act(id: string, run: () => Promise<{ ticket: ClientTicket }>) {
    setBusy(id)
    setError(null)
    try {
      onUpdate((await run()).ticket)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className={cx(CARD, 'relative')} aria-label={`Repair ${ticket.id}`}>
      <header className="flex h-9 items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5 text-[13px] text-fg-3">
          <span className={cx('font-mono font-medium text-fg-2', mark('ticket'))}>{ticket.id}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <ProgramIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{PROGRAM_SHORT[ticket.program]}</span>
          </span>
        </p>
        <div className="-mr-2 flex shrink-0">
          <IconButton icon={HistoryIcon} label="Updates" onClick={() => onOpen('history', ticket.id)} />
          <IconButton icon={Mail} label="Email" onClick={() => onOpen('email', ticket.id)} />
        </div>
      </header>

      {/* What someone types or scans comes first: the serial, then which device it is. */}
      <div className="mt-2 flex items-center gap-1 [@media(max-height:720px)]:mt-1.5">
        <h2 className="min-w-0 truncate font-mono text-[30px] font-semibold leading-tight tracking-[-0.01em] [@media(max-height:720px)]:text-[26px]">
          <span className={mark('serial')}>{ticket.device.serial}</span>
        </h2>
        <CopyButton value={ticket.device.serial} label="Copy serial" />
      </div>
      <p className="mt-0.5 truncate text-[13px] text-fg-2">
        {shortModel(ticket.device.model)} · <span className={cx('font-mono', mark('asset'))}>{ticket.device.assetTag}</span> · {ticket.device.school}
      </p>
      <p className="mt-1 flex h-4 items-center gap-3 overflow-hidden whitespace-nowrap font-mono text-[12px] text-fg-3">
        {ticket.trackingNumber && (
          <span className={cx('inline-flex items-center gap-1', mark('tracking'))}>
            <Truck className="size-3.5 shrink-0" aria-label="FedEx tracking" />
            {ticket.trackingNumber}
          </span>
        )}
        {ticket.claimNumber && (
          <span className={cx('inline-flex items-center gap-1', mark('claim'))}>
            <FileText className="size-3.5 shrink-0" aria-label="Claim" />
            {ticket.claimNumber}
          </span>
        )}
      </p>

      {/* Then where it is: the status in one line, and the tracker. */}
      <div className="mt-3 flex h-8 items-center gap-2.5 [@media(max-height:720px)]:mt-2.5">
        <IconBadge key={StatusIcon.displayName} icon={StatusIcon} tone={BADGE[tone]} size="sm" className="animate-pop" />
        <p className={cx('min-w-0 flex-1 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]', tone === 'bad' && 'text-bad')}>{ticketHeadline(ticket)}</p>
      </div>

      <Track ticket={ticket} chip={statusChip(ticket)} />
      {!ticket.attention && <Latest ticket={ticket} />}

      <div className="mt-auto space-y-2 pt-5 [@media(max-height:600px)]:pt-2">
        {ticket.attention ? (
          <Decide key={ticket.updatedAt} ticket={ticket} busy={busy} onAct={act} />
        ) : (
          <>
            {/* Kept in place when finished, so the card never changes height. */}
            <button
              onClick={() => act('advance', () => api.advance(ticket.id))}
              disabled={!canAdvance || !!busy}
              aria-hidden={!canAdvance}
              tabIndex={canAdvance ? 0 : -1}
              className={cx('mx-auto flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-fg-3 transition hover:bg-fill-2 hover:text-fg', !canAdvance && 'invisible')}
            >
              {busy === 'advance' ? <Spinner className="size-4" /> : <FastForward className="size-4" aria-hidden />}
              Next update
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="animate-enter absolute inset-x-4 bottom-4 z-10 flex items-center gap-2 rounded-2xl bg-bad px-4 py-3 text-[13px] font-medium text-white shadow-lg" role="alert">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span className="line-clamp-2">{error}</span>
        </p>
      )}
    </article>
  )
}

function Pager({ index, list, go }: { index: number; list: ClientTicket[]; go: (to: number) => void }) {
  return (
    <div className="mt-3 flex h-11 shrink-0 items-center justify-center gap-4">
      <button
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className="grid size-10 place-items-center rounded-full border border-line text-fg-2 disabled:opacity-30"
        aria-label="Previous repair"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      {list.length <= 12 ? (
        <div className="flex items-center gap-1.5" aria-label={`Repair ${index + 1} of ${list.length}`}>
          {list.map((ticket, i) => (
            <button
              key={ticket.id}
              onClick={() => go(i)}
              className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-fg' : ticket.attention ? 'w-1.5 bg-bad' : 'w-1.5 bg-fill-2')}
              aria-label={`Go to ${ticket.id}`}
            />
          ))}
        </div>
      ) : (
        <p className="min-w-16 text-center text-[13px] tabular-nums text-fg-2">
          {index + 1} / {list.length}
        </p>
      )}
      <button
        onClick={() => go(index + 1)}
        disabled={index >= list.length - 1}
        className="grid size-10 place-items-center rounded-full border border-line text-fg-2 disabled:opacity-30"
        aria-label="Next repair"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  )
}

export function Deck({
  tickets,
  focusId,
  pinned,
  highlight,
  onUpdate,
  onOpen,
}: {
  tickets: ClientTicket[]
  focusId?: string
  pinned?: string[]
  highlight?: { id: string; field: FindField } | null
  onUpdate: (ticket: ClientTicket) => void
  onOpen: (sheet: 'history' | 'email', id: string) => void
}) {
  const [order] = useState(() => orderTickets(tickets, pinned).map((ticket) => ticket.id))
  const ordered = order.map((id) => tickets.find((ticket) => ticket.id === id)).filter((ticket): ticket is ClientTicket => !!ticket)
  // Tickets created after the deck opened go first.
  const extra = tickets.filter((ticket) => !order.includes(ticket.id))
  const list = [...extra, ...ordered]
  const start = Math.max(
    0,
    list.findIndex((ticket) => ticket.id === focusId)
  )
  const [index, setIndex] = useState(start)
  const rail = useRef<HTMLDivElement>(null)

  const go = (to: number) => {
    const target = Math.min(list.length - 1, Math.max(0, to))
    const el = rail.current
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
    setIndex(target)
  }

  useEffect(() => {
    const el = rail.current
    if (el && start) el.scrollTo({ left: start * el.clientWidth })
  }, [start])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowRight') go(index + 1)
      if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const waiting = list.filter((ticket) => ticket.attention).length

  return (
    <div className={SHELL}>
      <div className="flex h-6 shrink-0 items-center justify-center gap-4 text-[13px] font-medium text-fg-2">
        <Count icon={Layers} value={list.length} label="repairs" />
        {waiting > 0 && <Count icon={CircleAlert} value={waiting} label="need you" className="text-bad" />}
      </div>
      <div
        ref={rail}
        data-tip="tracker"
        onScroll={(event) => {
          const el = event.currentTarget
          const next = Math.round(el.scrollLeft / el.clientWidth)
          if (next !== index) setIndex(next)
        }}
        className={cx(RAIL, 'no-scrollbar snap-x snap-mandatory overflow-x-auto')}
      >
        {list.map((ticket) => (
          <div key={ticket.id} className="flex h-full w-full shrink-0 snap-center snap-always px-1">
            <TrackerCard ticket={ticket} matched={highlight?.id === ticket.id ? highlight.field : null} onUpdate={onUpdate} onOpen={onOpen} />
          </div>
        ))}
      </div>
      <Pager index={index} list={list} go={go} />
    </div>
  )
}

/** First paint of a tracker link: the same shapes as a real card, shimmering until the data lands. */
export function DeckSkeleton({ error, onRetry }: { error?: boolean; onRetry?: () => void }) {
  return (
    <div className={SHELL} aria-busy={!error} aria-label="Loading repairs">
      <div className="flex h-6 shrink-0 items-center justify-center">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className={cx(RAIL, 'px-1')}>
        <div className={cx(CARD, 'relative')}>
          <div className="flex h-9 items-center justify-between">
            <Skeleton className="h-3 w-32" />
            <div className="flex gap-2">
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
            </div>
          </div>
          <div className="mt-2 flex h-[37px] items-center [@media(max-height:720px)]:mt-1.5 [@media(max-height:720px)]:h-8">
            <Skeleton className="h-7 w-48 rounded-lg" />
          </div>
          <Skeleton className="mt-1.5 h-3 w-56" />
          <div className="mt-1 h-4" />
          <div className="mt-3 flex h-8 items-center gap-2.5 [@media(max-height:720px)]:mt-2.5">
            <Skeleton className="size-8" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="mt-3 h-1.5 w-full [@media(max-height:720px)]:mt-2.5" />
          <div className="mt-2 flex h-7 items-center justify-between">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="mt-auto space-y-1 pt-5">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl opacity-60" />
            <Skeleton className="h-10 w-full rounded-xl opacity-30" />
            <div className="mt-2 h-9" />
          </div>
          {error && (
            <div className="absolute inset-0 grid place-items-center rounded-[28px] bg-fill/60 backdrop-blur-[2px]">
              <Action icon={RefreshCw} onClick={onRetry} className="w-auto px-5">
                Retry
              </Action>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex h-11 shrink-0 items-center justify-center gap-4">
        <Skeleton className="size-10" />
        <Skeleton className="h-1.5 w-24" />
        <Skeleton className="size-10" />
      </div>
    </div>
  )
}
