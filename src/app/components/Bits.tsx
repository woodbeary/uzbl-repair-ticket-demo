// Small shared pieces: skeletons, icon badges, counts and chips. Icons carry the meaning; text is
// a word or two, and every icon-only control has an accessible name.
import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cx } from '../lib/ui'

export type BadgeTone = 'neutral' | 'ok' | 'bad' | 'warn' | 'inverse'

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-fill-2 text-fg',
  ok: 'bg-ok/15 text-ok',
  bad: 'bg-bad/15 text-bad',
  warn: 'bg-warn/15 text-warn',
  inverse: 'bg-fg text-bg',
}

const BADGE_SIZE = {
  sm: 'size-8 [&>svg]:size-4',
  md: 'size-11 [&>svg]:size-[22px]',
  lg: 'size-14 [&>svg]:size-7 [@media(max-height:720px)]:size-11 [@media(max-height:720px)]:[&>svg]:size-[22px]',
}

/** Shimmering placeholder with the exact footprint of what will load. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('skeleton block', className)} />
}

export function IconBadge({ icon: Icon, tone = 'neutral', size = 'md', className }: { icon: LucideIcon; tone?: BadgeTone; size?: keyof typeof BADGE_SIZE; className?: string }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full', BADGE_SIZE[size], BADGE_TONE[tone], className)}>
      <Icon aria-hidden strokeWidth={2.2} />
    </span>
  )
}

/** Icon and number, with the meaning in the accessible name. */
export function Count({ icon: Icon, value, label, className }: { icon: LucideIcon; value: number | string; label: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 tabular-nums', className)} role="img" aria-label={`${value} ${label}`} title={label}>
      <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={2.2} />
      {value}
    </span>
  )
}

const CHIP_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-fill text-fg-2',
  ok: 'bg-ok/12 text-ok',
  bad: 'bg-bad/12 text-bad',
  warn: 'bg-warn/12 text-warn',
  inverse: 'bg-fg text-bg',
}

export function Chip({ icon: Icon, tone = 'neutral', className, children }: { icon?: LucideIcon; tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium', CHIP_TONE[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={2.2} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('size-[18px] animate-spin', className)} aria-hidden />
}

/** Full-width pill buttons used for every primary and secondary action. */
export function Action({
  icon: Icon,
  children,
  onClick,
  primary,
  busy,
  disabled,
  type = 'button',
  className,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  busy?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-40 [@media(max-height:720px)]:h-11',
        primary ? 'bg-fg text-bg' : 'bg-fill text-fg hover:bg-fill-2',
        className
      )}
    >
      {busy ? <Spinner /> : Icon && <Icon className="size-[18px] shrink-0" aria-hidden strokeWidth={2.2} />}
      {children}
    </button>
  )
}
