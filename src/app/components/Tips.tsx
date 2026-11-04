'use client'

// First-visit tips: a soft spotlight on one control at a time, with "Got it" and "Skip tips".
// The page stays usable underneath (the dimming ignores clicks), each tip is shown once, and
// "Skip tips" turns them all off. Remembered per browser.
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type TipId = 'find' | 'samples' | 'attachment' | 'tracker'

export const TIPS: Record<TipId, { title: string; body: string }> = {
  find: { title: 'Find any repair', body: 'Type a serial, asset tag or tracking number.' },
  samples: { title: 'Or start new ones', body: 'Try a sample list. Each is messy on purpose.' },
  attachment: { title: 'See what’s inside', body: 'Tap to see exactly what will be read.' },
  tracker: { title: 'Every repair at a glance', body: 'Serial first, then where it is.' },
}

const KEY = 'uzbl-demo-tips'
type State = { seen: TipId[]; off: boolean }
const OFF: State = { seen: [], off: true }
let state: State = { seen: [], off: false }
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<State>) }
  } catch {
    // Private windows and blocked storage just show the tips again next time.
  }
}

function update(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
  listeners.forEach((listener) => listener())
}

export const tips = {
  seen(id: TipId) {
    load()
    if (!state.seen.includes(id)) update({ ...state, seen: [...state.seen, id] })
  },
  skipAll() {
    load()
    update({ ...state, off: true })
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot() {
  load()
  return state
}

/** The first tip of `order` not seen yet, once the screen has settled; null while not `ready`. */
export function useTip(order: TipId[], ready = true): TipId | null {
  const current = useSyncExternalStore(subscribe, snapshot, () => OFF)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 700)
    return () => clearTimeout(timer)
  }, [])
  if (!settled || !ready || current.off) return null
  return order.find((id) => !current.seen.includes(id)) ?? null
}

const PAD = 6
const GAP = 14
const MARGIN = 12

type Box = { left: number; top: number; width: number; height: number }
type Side = 'below' | 'above' | 'right' | 'left' | 'over'

function same(a: Box | null, b: Box | null) {
  return !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/** What's on screen, in the coordinates `fixed` uses: the visual viewport (iOS toolbars, keyboard, zoom). */
function screen(): Box {
  const view = window.visualViewport
  return view ? { left: view.offsetLeft, top: view.offsetTop, width: view.width, height: view.height } : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

/** Where the card goes: below the target, else above, else beside it, else over its lower part; always fully on screen. */
function place(box: Box, width: number, height: number, view: Box): { side: Side; left: number; top: number } {
  const minX = view.left + MARGIN
  const maxX = view.left + view.width - MARGIN
  const minY = view.top + MARGIN
  const maxY = view.top + view.height - MARGIN
  const x = (want: number) => Math.min(Math.max(want, minX), maxX - width)
  const y = (want: number) => Math.max(Math.min(want, maxY - height), minY)
  const gap = PAD + GAP
  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2
  if (box.top + box.height + gap + height <= maxY) return { side: 'below', left: x(centerX - width / 2), top: box.top + box.height + gap }
  if (box.top - gap - height >= minY) return { side: 'above', left: x(centerX - width / 2), top: box.top - gap - height }
  if (box.left + box.width + gap + width <= maxX) return { side: 'right', left: box.left + box.width + gap, top: y(centerY - height / 2) }
  if (box.left - gap - width >= minX) return { side: 'left', left: box.left - gap - width, top: y(centerY - height / 2) }
  return { side: 'over', left: x(centerX - width / 2), top: y(maxY - height) }
}

/** Spotlights the element marked data-tip={id} and explains it in a small card beside it. */
export function Spotlight({ id, radius = 20 }: { id: TipId; radius?: number }) {
  const [box, setBox] = useState<Box | null>(null)
  const [view, setView] = useState<Box | null>(null)
  const [cardHeight, setCardHeight] = useState(132)
  const card = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useLayoutEffect(() => {
    let frame = 0
    const target = () => document.querySelector(`[data-tip="${id}"]`)
    const measure = () => {
      const el = target()
      const rect = el?.getBoundingClientRect()
      const next = rect && rect.width > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
      setBox((prev) => (same(prev, next) ? prev : next))
      const now = screen()
      setView((prev) => (same(prev, now) ? prev : now))
    }
    // Follow the target while enter animations settle, then on any resize or scroll.
    const started = performance.now()
    const follow = () => {
      measure()
      if (performance.now() - started < 1500) frame = requestAnimationFrame(follow)
    }
    follow()
    const observer = new ResizeObserver(measure)
    const el = target()
    if (el) observer.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [id])

  useLayoutEffect(() => {
    if (card.current && card.current.offsetHeight !== cardHeight) setCardHeight(card.current.offsetHeight)
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && tips.seen(id)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  if (!box || !view) return null
  const width = Math.min(300, view.width - MARGIN * 2)
  const { side, left, top } = place(box, width, cardHeight, view)
  // The arrow points at the target's middle, from whichever edge faces it; over the target it has nothing to point at.
  const along = (from: number, length: number, center: number) => Math.min(Math.max(center - from, 22), length - 22)
  const arrow: CSSProperties | null =
    side === 'below'
      ? { top: -5, left: along(left, width, box.left + box.width / 2) - 6 }
      : side === 'above'
        ? { bottom: -5, left: along(left, width, box.left + box.width / 2) - 6 }
        : side === 'right'
          ? { left: -5, top: along(top, cardHeight, box.top + box.height / 2) - 6 }
          : side === 'left'
            ? { right: -5, top: along(top, cardHeight, box.top + box.height / 2) - 6 }
            : null
  const copy = TIPS[id]

  // On <body>: the views' enter animation leaves a transform that would anchor `fixed` to the view.
  return createPortal(
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[45] motion-safe:transition-all motion-safe:duration-300"
        style={{
          left: box.left - PAD,
          top: box.top - PAD,
          width: box.width + PAD * 2,
          height: box.height + PAD * 2,
          borderRadius: radius + PAD,
          boxShadow: '0 0 0 2px rgb(255 255 255 / 0.92), 0 0 0 200vmax var(--dim)',
        }}
      />
      <div
        ref={card}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="animate-enter fixed z-[46] rounded-[20px] bg-fg text-bg shadow-2xl"
        style={{ left, top, width }}
      >
        {arrow && <span aria-hidden className="absolute size-3 rotate-45 rounded-[3px] bg-fg" style={arrow} />}
        {/* Never taller than the screen: on the smallest ones the words scroll and the buttons stay reachable. */}
        <div className="overflow-y-auto overscroll-contain p-4" style={{ maxHeight: view.height - MARGIN * 2 }}>
          <p id={titleId} className="text-[15px] font-semibold">
            {copy.title}
          </p>
          <p id={bodyId} className="mt-1 text-[14px] leading-snug opacity-75">
            {copy.body}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => tips.skipAll()} className="-ml-2 h-9 rounded-full px-2 text-[13px] font-medium opacity-60 hover:opacity-100">
              Skip tips
            </button>
            <button type="button" onClick={() => tips.seen(id)} className="h-9 rounded-full bg-bg px-4 text-[13px] font-semibold text-fg">
              Got it
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
