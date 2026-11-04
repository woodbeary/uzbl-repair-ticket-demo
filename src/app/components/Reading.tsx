'use client'

import type { LucideIcon } from 'lucide-react'
import { Check, CircleAlert, CircleCheck, Cloud, Columns3, FileText, ListChecks, ScanText, ShieldCheck, Split, TriangleAlert } from 'lucide-react'
import type { ColumnMapping, IntakeRow, StageTiming } from '@/shared/types'
import { DAMAGE } from '@/shared/labels'
import { DAMAGE_ICON, cx } from '../lib/ui'
import { Chip, Skeleton } from './Bits'

export type StageId = StageTiming['id']
export type StepState = { status: 'pending' | 'active' | 'done'; label: string; detail?: string }

export const STEP_ORDER: StageId[] = ['read', 'columns', 'extract', 'decide', 'rules']

export const STEP_INFO: Record<StageId, { label: string; icon: LucideIcon }> = {
  read: { label: 'Read', icon: FileText },
  columns: { label: 'Columns', icon: Columns3 },
  extract: { label: 'Extract', icon: ScanText },
  decide: { label: 'Decide', icon: Split },
  rules: { label: 'Check', icon: ListChecks },
}

function rowStatus(row: IntakeRow) {
  if (row.flags.some((flag) => flag.level === 'block')) return { icon: CircleAlert, className: 'text-bad', label: 'Needs you' }
  if (row.flags.some((flag) => flag.level === 'warn')) return { icon: TriangleAlert, className: 'text-warn', label: 'Check' }
  return { icon: CircleCheck, className: 'text-ok', label: 'Ready' }
}

/**
 * Everything here has a fixed size: the counter, the five steps, three row slots and the chips.
 * Data streams into the slots, so nothing on screen moves while the file is read.
 */
export function Reading({
  label,
  steps,
  columns,
  rows,
  total,
  aiMode,
}: {
  label: string
  steps: Record<StageId, StepState>
  columns: ColumnMapping[]
  rows: IntakeRow[]
  total: number
  aiMode: 'live' | 'mock' | null
}) {
  const dropped = columns.some((column) => column.dropped)
  const recent = rows.slice(-3).reverse()
  const active = STEP_ORDER.find((id) => steps[id].status === 'active')

  return (
    <div className="flex h-full flex-col items-center justify-center px-5">
      <div className="flex w-full max-w-sm flex-col items-center">
        <p className="inline-flex h-8 max-w-full items-center gap-2 rounded-full bg-fill px-3.5 text-[13px] text-fg-2">
          <FileText className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </p>

        <p className="mt-8 flex h-14 items-baseline text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums [@media(max-height:720px)]:mt-5">
          {rows.length}
          <span className="text-fg-3">/{total || '–'}</span>
        </p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-3">Devices</p>
        <p className="sr-only" aria-live="polite">
          {active ? STEP_INFO[active].label : 'Done'}
        </p>

        <ol className="mt-8 grid w-full grid-cols-5 [@media(max-height:720px)]:mt-6">
          {STEP_ORDER.map((id, index) => {
            const step = steps[id]
            const { label: stepLabel, icon: Icon } = STEP_INFO[id]
            return (
              <li key={id} className="relative flex flex-col items-center gap-2" aria-label={`${stepLabel}: ${step.status}`}>
                {index > 0 && (
                  <span
                    aria-hidden
                    className={cx(
                      'absolute left-[calc(-50%+26px)] right-[calc(50%+26px)] top-[21px] h-0.5 rounded-full transition-colors duration-500',
                      step.status === 'pending' ? 'bg-fill-2' : 'bg-fg'
                    )}
                  />
                )}
                <span
                  className={cx(
                    'relative grid size-11 place-items-center rounded-full transition-colors duration-300',
                    step.status === 'done' ? 'bg-fg text-bg' : step.status === 'active' ? 'bg-fill-2 text-fg' : 'bg-fill text-fg-3'
                  )}
                >
                  {step.status === 'done' ? <Check className="animate-pop size-5" strokeWidth={2.6} aria-hidden /> : <Icon className="size-5" aria-hidden />}
                  {step.status === 'active' && <span aria-hidden className="absolute -inset-0.5 animate-spin rounded-full border-2 border-transparent border-t-fg" />}
                </span>
                <span className={cx('text-[11px] font-medium', step.status === 'pending' ? 'text-fg-3' : 'text-fg-2')}>{stepLabel}</span>
              </li>
            )
          })}
        </ol>

        <ul className="mt-8 w-full space-y-1.5 [@media(max-height:720px)]:mt-6" aria-label="Latest devices">
          {[0, 1, 2].map((slot) => {
            const row = recent[slot]
            if (!row)
              return (
                <li key={`empty-${slot}`} className="flex h-10 items-center gap-2.5 rounded-full bg-fill px-3.5">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="ml-auto h-2.5 w-14" />
                </li>
              )
            const status = rowStatus(row)
            const damage = row.decisions.damage.value
            const DamageIcon = DAMAGE_ICON[damage]
            return (
              <li key={row.rowNumber} className={cx('flex h-10 items-center gap-2.5 rounded-full bg-fill px-3.5', slot === 0 && 'animate-slot')}>
                <status.icon className={cx('size-4 shrink-0', status.className)} aria-label={status.label} />
                <span className="truncate font-mono text-[13px]">{row.serial || '—'}</span>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3">
                  <DamageIcon className="size-3.5" aria-hidden />
                  {DAMAGE[damage].label.split(' /')[0]}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 flex h-7 items-center gap-2">
          <Chip icon={ShieldCheck} tone="ok" className={cx('transition-opacity duration-300', dropped ? 'opacity-100' : 'opacity-0')}>
            Names removed
          </Chip>
          <Chip icon={Cloud}>{aiMode === 'mock' ? 'Stand-in models' : 'Clef + Clairic'}</Chip>
        </div>
      </div>
    </div>
  )
}
