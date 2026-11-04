'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleAlert, CircleCheck, CircleMinus, Hash, Lock, Mail, Timer, User } from 'lucide-react'
import type { ClientTicket, IntakeResult, IntakeRow } from '@/shared/types'
import { DAMAGE } from '@/shared/labels'
import { isProgram } from '@/shared/rules'
import { stageLabel } from '@/shared/stages'
import { DAMAGE_ICON, FLAG_SHORT, PROGRAM_ICON, PROGRAM_SHORT, SOURCE_ICON, cx, dateTime, relativeTime } from '../lib/ui'
import { Chip, IconBadge } from './Bits'
import { STEP_INFO } from './Reading'

export function History({ ticket }: { ticket: ClientTicket }) {
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line">
      {[...ticket.events].reverse().map((event, index) => {
        const Icon = event.kind === 'problem' ? CircleAlert : event.kind === 'resolved' ? CircleCheck : SOURCE_ICON[event.source]
        return (
          <li key={`${event.at}-${index}`} className="relative flex gap-3">
            <span
              className={cx(
                'relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-bg',
                event.kind === 'problem' ? 'bg-bad text-white' : event.kind === 'resolved' ? 'bg-ok text-white' : index === 0 ? 'bg-fg text-bg' : 'bg-fill-2 text-fg-2'
              )}
            >
              <Icon className="size-4" aria-label={event.source} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-medium">{event.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-fg-3">
                  {event.notify && <Mail className="size-3" aria-label="Emailed" />}
                  <time dateTime={event.at} title={dateTime(event.at)}>
                    {relativeTime(event.at)}
                  </time>
                </span>
              </p>
              {event.detail && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-3">{event.detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Preview of the update email the submitter gets. Emails stay light. */
export function EmailPreview({ ticket }: { ticket: ClientTicket }) {
  const emails = ticket.events.filter((event) => event.notify).reverse()
  const [index, setIndex] = useState(0)
  const event = emails[index]
  if (!event)
    return (
      <p className="flex items-center gap-2 text-sm text-fg-2">
        <Mail className="size-4" aria-hidden /> None yet
      </p>
    )
  const action = event.kind === 'problem' || event.kind === 'decision'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={User}>{ticket.submittedBy.name}</Chip>
        <Chip icon={Lock} tone="ok">
          Only the submitter
        </Chip>
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {emails.map((item, i) => (
          <button key={i} onClick={() => setIndex(i)} className={cx('h-8 shrink-0 rounded-full px-3 text-xs font-medium tabular-nums', i === index ? 'bg-fg text-bg' : 'bg-fill text-fg-2')}>
            {i === 0 ? 'Latest' : relativeTime(item.at)}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-2xl bg-[#F8FAFC] px-4 py-6 text-[#111827]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <p className="text-center text-[22px] font-extrabold tracking-[6px]">UZBL</p>
        <div className="mx-auto mt-4 max-w-[600px] rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(17,24,39,0.06)]">
          {action && <span className="mb-2 inline-block rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#B91C1C]">Action needed</span>}
          <p className="text-xl font-bold">{event.title}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#4B5563]">
            Hi {ticket.submittedBy.name.split(' ')[0]}, an update on your {ticket.device.model.split(' ').slice(0, 2).join(' ')}.{event.detail ? ` ${event.detail}` : ''}
          </p>
          <div className="mt-4 space-y-1.5 text-sm">
            {[
              ['Status', stageLabel(ticket.program, event.stage ?? ticket.stage)],
              ['Repair', ticket.id],
              ['Serial', ticket.device.serial],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 rounded-lg bg-[#F2F2F7] px-3 py-2">
                <span className="w-14 shrink-0 text-[#48484A]">{label}</span>
                <span className="font-medium text-[#1C1C1E]">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center">
            <span className="inline-block rounded-lg bg-[#1F2937] px-6 py-3 text-sm font-semibold text-white">{action ? 'Fix it in one tap' : 'View live status'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function modelName(model: string | null, id: string): string {
  if (!model) return id === 'rules' ? 'Rules in code' : id === 'read' ? 'Built-in reader' : 'Stand-in model'
  if (model.includes('clairic')) return 'Clairic'
  if (model.includes('clef')) return 'Clef'
  if (model.includes('Markdown')) return 'Markdown Conversion'
  if (model.includes('llama-4-scout')) return 'Llama 4 Scout'
  return model
}

function Tile({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-fill px-2 py-3 text-center">
      <Icon className="mx-auto size-4 text-fg-3" aria-hidden />
      <p className="mt-1.5 text-[17px] font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-fg-3">{label}</p>
    </div>
  )
}

export function UnderTheHood({ result }: { result: IntakeResult }) {
  const tokens = result.stages.reduce((sum, stage) => sum + stage.inputTokens, 0)
  const ms = result.stages.reduce((sum, stage) => sum + stage.ms, 0)
  return (
    <div>
      <ol className="divide-y divide-line">
        {result.stages.map((stage) => {
          const info = STEP_INFO[stage.id]
          return (
            <li key={stage.id} className="flex items-center gap-3 py-3">
              <IconBadge icon={info.icon} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{info.label}</p>
                <p className="truncate text-[12px] text-fg-3">
                  {modelName(stage.model, stage.id)}
                  {stage.calls > 1 ? ` × ${stage.calls}` : ''}
                  {stage.fallback ? ' · backup rules' : ''}
                </p>
              </div>
              <span className="font-mono text-[12px] tabular-nums text-fg-2">{stage.ms} ms</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile icon={Hash} value={tokens.toLocaleString()} label="Tokens" />
        <Tile icon={Timer} value={`${(ms / 1000).toFixed(1)} s`} label="Time" />
      </div>
    </div>
  )
}

export function RowList({ rows }: { rows: IntakeRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const flag = row.flags.find((candidate) => candidate.level === 'block') ?? row.flags.find((candidate) => candidate.level === 'warn')
        const short = flag ? FLAG_SHORT[flag.code] : null
        const damage = row.decisions.damage.value
        const DamageIcon = DAMAGE_ICON[damage]
        const RouteIcon = row.include && isProgram(row.route) ? PROGRAM_ICON[row.route] : CircleMinus
        return (
          <li key={row.rowNumber} className="flex h-14 items-center gap-3">
            <span className={cx('size-2 shrink-0 rounded-full', row.include ? 'bg-ok' : flag?.level === 'block' ? 'bg-bad' : 'bg-fg-3')} />
            <span className="w-[6.5rem] shrink-0 truncate font-mono text-[13px]">{row.serial || '—'}</span>
            <DamageIcon className="size-4 shrink-0 text-fg-3" aria-label={DAMAGE[damage].label} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{short?.label ?? ''}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-fg-2">
              <RouteIcon className="size-3.5" aria-hidden />
              {row.include && isProgram(row.route) ? PROGRAM_SHORT[row.route] : 'Skip'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
