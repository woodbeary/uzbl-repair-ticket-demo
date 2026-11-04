'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * iOS-style bottom sheet (centered card on wide screens). The only place anything scrolls.
 * Rendered on <body>, so it covers the whole screen even when opened from inside a view.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="animate-fade absolute inset-0 bg-black/25 backdrop-blur-[3px] dark:bg-black/50" onClick={onClose} />
      <div className="animate-sheet pb-safe relative flex max-h-[86dvh] w-full max-w-lg flex-col rounded-t-[28px] border border-line bg-bg shadow-2xl sm:rounded-[28px]">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-fill-2 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full bg-fill text-fg-2 hover:bg-fill-2" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="no-scrollbar overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}
