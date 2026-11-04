'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, ArrowUp, CircleAlert, Eye, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, Plus, SearchX, X } from 'lucide-react'
import type { ClientTicket } from '@/shared/types'
import { FIELD_LABEL, findTickets, looksLikeId, type FindMatch } from '../lib/find'
import { SAMPLE_NOTES, inspectFile, kindOf, sampleFile, type FileInfo, type FileKind } from '../lib/files'
import { TONE_DOT, cx, shortModel, ticketHeadline, ticketTone } from '../lib/ui'
import { Skeleton, Spinner } from './Bits'
import { FilePreview } from './Preview'
import { Sheet } from './Sheet'
import { Spotlight, tips, useTip } from './Tips'

export type IntakeSource = { file?: File; sample?: string; text?: string; label: string }

const SAMPLES = [
  { sample: 'pinecrest-repairs-oct.xlsx', label: 'Excel', icon: FileSpreadsheet },
  { sample: 'pinecrest-repairs.csv', label: 'CSV', icon: FileText },
  { sample: 'repair-list-screenshot.png', label: 'Screenshot', icon: ImageIcon },
]

const ACCEPT = '.xlsx,.xlsm,.xls,.csv,.ods,.numbers,.pdf,.docx,.txt,image/*'

const KIND_ICON: Record<FileKind, LucideIcon> = { excel: FileSpreadsheet, csv: FileText, image: ImageIcon, text: FileText, document: FileText }

/** A file waiting in the composer: a sample (read on the server by name) or the person's own file. */
interface Attachment {
  name: string
  sample?: string
  file?: File
  info: FileInfo | null
}

function Marked({ value, range: [from, to] }: { value: string; range: [number, number] }) {
  return (
    <>
      {value.slice(0, from)}
      <mark className="rounded-[4px] bg-fill-2 px-px text-fg">{value.slice(from, to)}</mark>
      {value.slice(to)}
    </>
  )
}

/** One repair in the quick-find list: the identifiers first, then a glance at where it is. */
export function Result({ match, active, onOpen, onHover }: { match: FindMatch; active: boolean; onOpen: () => void; onHover: () => void }) {
  const { ticket, field } = match
  const tone = ticketTone(ticket)
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseMove={onHover}
      aria-label={`Open ${ticket.id}, serial ${ticket.device.serial}`}
      className={cx('flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-left', active ? 'bg-fill-2' : 'hover:bg-fill')}
    >
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-mono text-[15px] font-semibold">{field === 'serial' ? <Marked value={match.value} range={match.range} /> : ticket.device.serial}</span>
          <span className="font-mono text-[12px] text-fg-3">{field === 'ticket' ? <Marked value={match.value} range={match.range} /> : ticket.id}</span>
        </span>
        <span className="block truncate text-[12px] text-fg-3">
          {field === 'serial' || field === 'ticket' ? (
            `${shortModel(ticket.device.model)} · ${ticket.device.school}`
          ) : (
            <>
              {FIELD_LABEL[field]}{' '}
              <span className="font-mono">
                <Marked value={match.value} range={match.range} />
              </span>{' '}
              · {shortModel(ticket.device.model)}
            </>
          )}
        </span>
      </span>
      <span className={cx('flex shrink-0 items-center gap-1.5 text-[13px]', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg-2')}>
        <span className={cx('size-2 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden />
        <span className="max-w-[7.5rem] truncate sm:max-w-[12rem]">{ticketHeadline(ticket)}</span>
      </span>
    </button>
  )
}

export function Home({
  tickets,
  loaded,
  onRun,
  onFind,
  error,
}: {
  tickets: ClientTicket[]
  /** False until the repairs have arrived, so an early search waits instead of saying "no match". */
  loaded: boolean
  onRun: (source: IntakeSource) => void
  onFind: (match: FindMatch) => void
  error: string | null
}) {
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [active, setActive] = useState(-1)
  /** Enter was pressed on an identifier before the repairs arrived: open it as soon as they do. */
  const [pending, setPending] = useState(false)
  const [wide, setWide] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const matches = useMemo(() => (attachment ? [] : findTickets(tickets, text)), [attachment, tickets, text])
  // Enter opens the highlighted repair, or the only one when the text is its exact identifier.
  const target = active >= 0 ? matches[active] : matches.length === 1 && matches[0].exact ? matches[0] : undefined
  // An identifier is only ever looked up; a sentence (or a pasted email) is read as new repairs.
  const idLike = !attachment && looksLikeId(text)
  const missing = idLike && loaded && !matches.length
  const describes = !attachment && !idLike && text.trim().length >= 6
  const canSend = !!attachment || !!target || describes || (idLike && !loaded)
  const tip = useTip(attachment ? ['attachment'] : ['find', 'samples'], !previewing && !dragging)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setActive(-1)
    setPending(false)
  }, [text])

  useEffect(() => {
    if (pending && target) {
      setPending(false)
      open(target)
    }
  })

  // The picture preview is an object URL; free it once it is no longer shown.
  const imageUrl = attachment?.info?.image?.url
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

  /** Shows the file in the composer at once, then fills in what it holds. */
  function attach(next: Attachment, load: Promise<File>) {
    tips.seen('samples')
    setText('')
    setAttachment(next)
    load
      .then(inspectFile)
      .catch((): FileInfo => ({ kind: kindOf(next.name), summary: 'Ready to send' }))
      .then((info) => setAttachment((current) => (current?.name === next.name ? { ...current, info } : current)))
  }

  const attachFile = (chosen: File) => attach({ name: chosen.name, file: chosen, info: null }, Promise.resolve(chosen))
  const attachSample = (sample: string) => attach({ name: sample, sample, info: null }, sampleFile(sample))
  const onDrop = useRef(attachFile)
  onDrop.current = attachFile

  // Drop anywhere on the screen.
  useEffect(() => {
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (event: DragEvent) => event.preventDefault()
    const drop = (event: DragEvent) => {
      event.preventDefault()
      depth = 0
      setDragging(false)
      const dropped = event.dataTransfer?.files?.[0]
      if (dropped) onDrop.current(dropped)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  function grow() {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function open(match: FindMatch) {
    tips.seen('find')
    onFind(match)
  }

  function send() {
    if (attachment) {
      tips.seen('attachment')
      setPreviewing(false)
      if (attachment.sample) onRun({ sample: attachment.sample, label: attachment.name })
      else if (attachment.file) onRun({ file: attachment.file, label: attachment.name })
      return
    }
    if (target) return open(target)
    if (idLike) return setPending(!loaded)
    if (describes) onRun({ text: text.trim(), label: 'Your message' })
  }

  const KindIcon = KIND_ICON[attachment?.info?.kind ?? kindOf(attachment?.name ?? '')]

  return (
    <div className="flex h-full flex-col items-center justify-center px-5">
      <h1 className="text-balance text-center text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[48px]">Find a repair, or start one</h1>

      <form
        data-tip="find"
        className={cx('relative mt-8 flex w-full max-w-xl items-end gap-1.5 rounded-[28px] border bg-fill p-1.5 transition', dragging ? 'border-fg' : 'border-line focus-within:border-fg-3')}
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-fill-2"
          aria-label="Attach a file or take a photo"
        >
          <Plus className="size-5" aria-hidden />
        </button>

        {attachment ? (
          // Same height as the text field it replaces, so attaching never moves the screen.
          <div data-tip="attachment" className="flex h-[46px] min-w-0 flex-1 items-center gap-1 rounded-[22px] bg-bg pr-1 ring-1 ring-line">
            <button
              type="button"
              onClick={() => {
                tips.seen('attachment')
                setPreviewing(true)
              }}
              className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[22px] pl-2.5 pr-2 text-left hover:bg-fill"
              aria-label={`Preview ${attachment.name}`}
            >
              {attachment.info?.image ? (
                <img src={attachment.info.image.url} alt="" className="size-8 shrink-0 rounded-md border border-line object-cover object-left-top" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-fill-2">
                  <KindIcon className="size-4" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium leading-5">{attachment.name}</span>
                {attachment.info ? <span className="block truncate text-[11px] leading-4 text-fg-3">{attachment.info.summary}</span> : <Skeleton className="mt-1 h-2 w-28" />}
              </span>
              <Eye className="hidden size-4 shrink-0 text-fg-3 sm:block" aria-hidden />
            </button>
            <button type="button" onClick={() => setAttachment(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-fill-2 hover:text-fg" aria-label="Remove file">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <textarea
            ref={area}
            rows={1}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              if (event.target.value.trim().length >= 2) tips.seen('find')
              grow()
            }}
            onKeyDown={(event) => {
              if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault()
                setActive((index) => (event.key === 'ArrowDown' ? Math.min(matches.length - 1, index + 1) : Math.max(-1, index - 1)))
              } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              } else if (event.key === 'Escape' && text) {
                setText('')
              }
            }}
            placeholder={wide ? 'Serial, asset tag, ticket or tracking number' : 'Serial or tracking number'}
            aria-label="Find a repair or describe one"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 resize-none bg-transparent py-[11px] text-[17px] leading-6 outline-none placeholder:text-fg-3"
          />
        )}

        <button
          type="submit"
          disabled={!canSend}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-bg transition disabled:bg-fill-2 disabled:text-fg-3"
          aria-label={target ? `Open ${target.ticket.id}` : 'Send'}
        >
          {target ? <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden /> : <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />}
        </button>
        <input
          ref={file}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="file-input"
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            if (chosen) attachFile(chosen)
            event.target.value = ''
          }}
        />

        {/* Opens upward on phones, where the keyboard covers everything below the field; best match nearest it. */}
        {(matches.length > 0 || missing || (idLike && !loaded)) && (
          <div
            className="animate-fade absolute inset-x-0 bottom-full z-30 mb-2 flex flex-col-reverse overflow-hidden rounded-3xl border border-line bg-bg p-1.5 shadow-xl sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2 sm:flex-col"
            aria-label="Matching repairs"
          >
            {matches.map((match, index) => (
              <Result key={match.ticket.id} match={match} active={index === active} onOpen={() => open(match)} onHover={() => setActive(index)} />
            ))}
            {missing && (
              <p className="flex h-12 items-center gap-2.5 px-3 text-[14px] text-fg-3">
                <SearchX className="size-4 shrink-0" aria-hidden />
                <span className="truncate">No repair matches “{text.trim()}”</span>
              </p>
            )}
            {idLike && !loaded && (
              <p className="flex h-12 items-center gap-2.5 px-3 text-[14px] text-fg-3">
                <Spinner className="size-4 shrink-0" />
                Loading repairs…
              </p>
            )}
          </div>
        )}
      </form>

      <div data-tip="samples" className="mt-4 flex items-center gap-2">
        <span className="text-[12px] text-fg-3">Try</span>
        {SAMPLES.map(({ sample, label, icon: Icon }) => (
          <button
            key={sample}
            type="button"
            onClick={() => attachSample(sample)}
            aria-pressed={attachment?.sample === sample}
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition',
              attachment?.sample === sample ? 'border-fg bg-fg text-bg' : 'border-line text-fg-2 hover:border-fg-3 hover:text-fg'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {/* Reserved so an error never moves the screen. */}
      <p className="mt-4 flex h-5 max-w-md items-center gap-1.5 text-sm text-bad" role="alert">
        {error && (
          <>
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{error}</span>
          </>
        )}
      </p>

      {dragging &&
        createPortal(
          <div className="animate-fade pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/80 backdrop-blur-sm">
            <FileUp className="size-12" strokeWidth={1.6} aria-label="Drop to attach" />
          </div>,
          document.body
        )}

      {previewing && attachment && (
        <Sheet title={attachment.name} onClose={() => setPreviewing(false)}>
          <FilePreview info={attachment.info} note={attachment.sample ? SAMPLE_NOTES[attachment.sample] : undefined} onSend={send} />
        </Sheet>
      )}

      {tip && <Spotlight id={tip} radius={tip === 'find' ? 28 : tip === 'attachment' ? 22 : 18} />}
    </div>
  )
}
