'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, CircleCheck, Plus, RotateCcw, WifiOff, Wrench } from 'lucide-react'
import type { ClientTicket, ColumnMapping, IntakeResult, IntakeRow, SubmissionRow } from '@/shared/types'
import { SCHOOL } from '@/shared/inventory'
import { isProgram } from '@/shared/rules'
import { api, streamIntake, type StateResponse } from '../lib/api'
import type { FindField, FindMatch } from '../lib/find'
import { openIssues, reviewedRows, type Edit } from '../lib/review'
import { Count, Skeleton } from './Bits'
import { Deck, DeckSkeleton } from './Deck'
import { Home, type IntakeSource } from './Home'
import { Logo } from './Logo'
import { Reading, STEP_ORDER, type StageId, type StepState } from './Reading'
import { Review } from './Review'
import { Sheet } from './Sheet'
import { EmailPreview, History, RowList, UnderTheHood } from './SheetContents'
import { Spotlight, useTip } from './Tips'

type View = 'home' | 'reading' | 'review' | 'deck'
type SheetState = { kind: 'history' | 'email'; id: string } | { kind: 'list' | 'hood' } | null

function freshSteps(): Record<StageId, StepState> {
  return Object.fromEntries(STEP_ORDER.map((id) => [id, { status: 'pending', label: '' }])) as Record<StageId, StepState>
}

/** The whole demo is this one screen: home → reading → one question at a time → tracker. */
export function App({ focusId }: { focusId?: string }) {
  const router = useRouter()
  const [view, setView] = useState<View>(focusId ? 'deck' : 'home')
  const [data, setData] = useState<StateResponse | null>(null)
  const [focus, setFocus] = useState<string | undefined>(focusId)
  const [pinned, setPinned] = useState<string[]>([])
  const [deckKey, setDeckKey] = useState(0)
  /** The identifier a quick find matched, marked on that repair's card. */
  const [highlight, setHighlight] = useState<{ id: string; field: FindField } | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [steps, setSteps] = useState(freshSteps)
  const [columns, setColumns] = useState<ColumnMapping[]>([])
  const [streamed, setStreamed] = useState<IntakeRow[]>([])
  const [total, setTotal] = useState(0)
  const [result, setResult] = useState<IntakeResult | null>(null)
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [peakIssues, setPeakIssues] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [loadFailed, setLoadFailed] = useState(false)
  const load = useCallback(
    () =>
      api.state().then(
        (state) => {
          setData(state)
          setLoadFailed(false)
        },
        () => setLoadFailed(true)
      ),
    []
  )
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const rows = useMemo(() => (result ? reviewedRows(result, edits) : streamed), [result, edits, streamed])
  const issues = useMemo(() => (result ? openIssues(rows, edits, resolved) : []), [result, rows, edits, resolved])
  useEffect(() => setPeakIssues((peak) => Math.max(peak, issues.length + resolved.size)), [issues.length, resolved.size])

  const run = useCallback(async (source: IntakeSource) => {
    setView('reading')
    setLabel(source.label)
    setSteps(freshSteps())
    setColumns([])
    setStreamed([])
    setTotal(0)
    setResult(null)
    setEdits({})
    setResolved(new Set())
    setPeakIssues(0)
    setSubmitError(null)
    setHomeError(null)
    try {
      let finished = false
      await streamIntake(source, (event) => {
        if (event.type === 'stage') setSteps((prev) => ({ ...prev, [event.id]: { status: event.status === 'start' ? 'active' : 'done', label: event.label, detail: event.detail } }))
        else if (event.type === 'columns') {
          setColumns(event.columns)
          setTotal(event.rowCount)
        } else if (event.type === 'row') setStreamed((prev) => [...prev, event.row])
        else if (event.type === 'result') {
          finished = true
          setResult(event.result)
          setTimeout(() => setView('review'), 450)
        } else if (event.type === 'error') throw new Error(event.message)
      })
      // A dropped connection ends the stream early; never leave the screen spinning.
      if (!finished) throw new Error('Reading stopped early. Try again.')
    } catch (err) {
      setHomeError((err as Error).message)
      setView('home')
    }
  }, [])

  async function submit() {
    setSubmitting(true)
    setSubmitError(null)
    const payload: SubmissionRow[] = rows
      .filter((row) => row.include && isProgram(row.route))
      .map((row) => ({
        rowNumber: row.rowNumber,
        serial: row.serial,
        route: row.route as SubmissionRow['route'],
        whatHappened: row.fields.whatHappened.value ?? '',
        incidentDate: row.fields.incidentDate.value ?? result?.today ?? null,
        location: row.fields.location.value,
        shipTo: row.fields.shipTo.value,
        damage: row.decisions.damage.value,
      }))
    try {
      const response = await api.submit(payload)
      await load()
      setFocus(response.created[0]?.id)
      setPinned(response.created.map((ticket) => ticket.id))
      setDeckKey((key) => key + 1)
      setView('deck')
      setToast(`${response.created.length} submitted`)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function openTracker(id?: string, mark: { id: string; field: FindField } | null = null) {
    setFocus(id)
    setPinned([])
    setHighlight(mark)
    setDeckKey((key) => key + 1)
    setView('deck')
  }

  const find = (match: FindMatch) => openTracker(match.ticket.id, { id: match.ticket.id, field: match.field })

  function updateTicket(ticket: ClientTicket) {
    setData((prev) => (prev ? { ...prev, tickets: prev.tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate)) } : prev))
  }

  async function reset() {
    await api.reset().catch(() => {})
    await load()
    setDeckKey((key) => key + 1)
    setFocus(undefined)
    setPinned([])
    setView('home')
    router.replace('/')
  }

  const tickets = data?.tickets ?? []
  const open = tickets.filter((ticket) => !ticket.closed).length
  const waiting = tickets.filter((ticket) => ticket.attention).length
  const sheetTicket = sheet && 'id' in sheet ? tickets.find((ticket) => ticket.id === sheet.id) : undefined
  const deckTip = useTip(['tracker'], view === 'deck' && !!data && !sheet)

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45dvh] bg-[radial-gradient(70%_100%_at_50%_100%,var(--glow),transparent)]" aria-hidden />

      {/* Logo on the left, repairs on the right. */}
      <header className="pt-safe relative z-10 grid grid-cols-[1fr_1fr] items-center gap-2 px-4 pb-2 sm:px-5">
        <button onClick={() => setView('home')} className="flex h-11 items-center justify-self-start" aria-label="Home">
          <Logo className="h-4 w-auto sm:h-[18px]" />
        </button>
        <div className="justify-self-end">
          {view === 'deck' ? (
            <button onClick={() => setView('home')} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-2.5 text-[13px] font-medium hover:bg-fill sm:px-3.5" aria-label="New">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">New</span>
            </button>
          ) : data ? (
            <button
              onClick={() => openTracker()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line px-2.5 text-[13px] font-medium text-fg-2 hover:bg-fill sm:min-w-[5.5rem] sm:gap-3 sm:px-3.5"
              aria-label={`Repairs: ${open} in repair${waiting ? `, ${waiting} need you` : ''}`}
            >
              <Count icon={Wrench} value={open} label="in repair" />
              {waiting > 0 && (
                <>
                  <span className="hidden sm:inline-flex">
                    <Count icon={CircleAlert} value={waiting} label="need you" className="text-bad" />
                  </span>
                  <span className="size-2 rounded-full bg-bad sm:hidden" aria-hidden />
                </>
              )}
            </button>
          ) : loadFailed ? (
            <button onClick={load} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-2.5 text-[13px] font-medium text-fg-2 hover:bg-fill sm:px-3.5">
              <WifiOff className="size-4" aria-hidden />
              <span className="hidden sm:inline">Retry</span>
            </button>
          ) : (
            <Skeleton className="h-9 w-14 sm:w-[5.5rem]" />
          )}
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        <div key={view} className="animate-enter h-full">
          {view === 'home' && <Home tickets={tickets} loaded={!!data} onRun={run} onFind={find} error={homeError} />}
          {view === 'reading' && <Reading label={label} steps={steps} columns={columns} rows={streamed} total={total} aiMode={data?.aiMode ?? null} />}
          {view === 'review' && result && (
            <Review
              result={result}
              rows={rows}
              issues={issues}
              totalIssues={Math.max(peakIssues, issues.length)}
              submitting={submitting}
              error={submitError}
              onEdit={(rowNumber, patch) => setEdits((prev) => ({ ...prev, [rowNumber]: { ...prev[rowNumber], ...patch } }))}
              onResolve={(key) => setResolved((prev) => new Set(prev).add(key))}
              onSubmit={submit}
              onRestart={() => setView('home')}
              onOpen={(kind) => setSheet({ kind })}
            />
          )}
          {view === 'deck' &&
            (data ? (
              <Deck key={deckKey} tickets={tickets} focusId={focus} pinned={pinned} highlight={highlight} onUpdate={updateTicket} onOpen={(kind, id) => setSheet({ kind, id })} />
            ) : (
              <DeckSkeleton error={loadFailed} onRetry={load} />
            ))}
        </div>
      </main>

      <footer className="pb-safe relative z-10 flex h-[calc(2.25rem+env(safe-area-inset-bottom))] items-center justify-center gap-4 px-5 text-[11px] text-fg-3">
        <span className="whitespace-nowrap">
          Sample data<span className="hidden sm:inline"> · {SCHOOL.district}</span>
        </span>
        <button onClick={reset} className="inline-flex items-center gap-1 hover:text-fg">
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      </footer>

      {toast && (
        <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-5">
          <p className="animate-enter mt-14 inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-[13px] font-medium text-bg shadow-lg" role="status">
            <CircleCheck className="size-4" aria-hidden />
            {toast}
          </p>
        </div>
      )}

      {sheet?.kind === 'history' && sheetTicket && (
        <Sheet title="Updates" onClose={() => setSheet(null)}>
          <History ticket={sheetTicket} />
        </Sheet>
      )}
      {sheet?.kind === 'email' && sheetTicket && (
        <Sheet title="Email" onClose={() => setSheet(null)}>
          <EmailPreview ticket={sheetTicket} />
        </Sheet>
      )}
      {sheet?.kind === 'list' && (
        <Sheet title={`${rows.length} devices`} onClose={() => setSheet(null)}>
          <RowList rows={rows} />
        </Sheet>
      )}
      {sheet?.kind === 'hood' && result && (
        <Sheet title="Details" onClose={() => setSheet(null)}>
          <UnderTheHood result={result} />
        </Sheet>
      )}

      {deckTip && <Spotlight id={deckTip} radius={deckTip === 'tracker' ? 28 : 999} />}
    </div>
  )
}
