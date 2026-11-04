'use client'

// A fix suggested in place of what the file had, in as few words as it takes: the old value struck through, and the
// suggestion, big, in a selected card. The question above it and one button do the rest.
import type { LucideIcon } from 'lucide-react'
import { MapPin, Pencil } from 'lucide-react'
import { cx } from '../lib/ui'

/** "Pinecrest High School, 1450 Timberline Rd, Pinecrest, CO 80999" → the street, and the place it is. */
export function splitAddress(address: string): { street: string; place?: string } {
  const parts = address.split(',').map((part) => part.trim())
  const at = parts.findIndex((part) => /^\d/.test(part))
  if (at < 0) return { street: address.trim() }
  return { street: parts[at], place: parts.slice(0, at).join(', ') || parts.slice(at + 1).join(', ') }
}

/** Just the box: "PO Box 1187". */
export function boxOnly(text: string): string {
  return text.match(/p\.?\s*o\.?\s*box\s*\d+/i)?.[0] ?? text
}

export function Suggestion({ old, icon: Icon, title, detail, mono, onEdit, className }: { old?: string; icon: LucideIcon; title: string; detail?: string; mono?: boolean; onEdit?: () => void; className?: string }) {
  return (
    <div className={cx('text-center', className)}>
      {old && <p className={cx('text-[15px] text-fg-3 line-through decoration-fg-3/70', mono && 'font-mono')}>{old}</p>}
      <div className={cx('flex items-center gap-3 rounded-2xl bg-bg py-3 pl-4 text-left ring-2 ring-fg', onEdit ? 'pr-2' : 'pr-4', old && 'mt-2')}>
        <Icon className="size-5 shrink-0" aria-hidden strokeWidth={2.2} />
        <div className="min-w-0 flex-1">
          <p className={cx('truncate text-[17px] font-semibold leading-6', mono && 'font-mono')}>{title}</p>
          {detail && <p className="truncate text-[14px] leading-5 text-fg-2">{detail}</p>}
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} className="grid size-10 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-fill hover:text-fg" aria-label="Edit">
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

/** The PO-box fix: the box struck through, the street address and the place it is. */
export function SuggestedAddress({ poBox, address, onEdit, className }: { poBox?: string; address: string; onEdit?: () => void; className?: string }) {
  const { street, place } = splitAddress(address)
  return <Suggestion old={poBox} icon={MapPin} title={street} detail={place} onEdit={onEdit} className={className} />
}
