import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  Barcode,
  BadgeCheck,
  BatteryWarning,
  CalendarX,
  CheckCheck,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  Code,
  Copy,
  Cpu,
  Droplets,
  FileSearch,
  Inbox,
  Keyboard,
  Laptop,
  MapPinOff,
  MessageSquareText,
  Monitor,
  PackageCheck,
  Plug,
  Power,
  PowerOff,
  Scale,
  ScanBarcode,
  School,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  ShieldX,
  Sparkles,
  Stethoscope,
  Tag,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react'
import type { ClientTicket, Damage, EventSource, Program } from '@/shared/types'
import { STAGES, stageIndex, stageLabel } from '@/shared/stages'

export type Tone = 'ok' | 'bad' | 'warn' | 'live' | 'idle'

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  bad: 'bg-bad',
  warn: 'bg-warn',
  live: 'bg-fg animate-breathe',
  idle: 'bg-fg-3',
}

export const PROGRAM_ICON: Record<Program, LucideIcon> = { warranty: ShieldCheck, oem: Laptop, break_fix: Wrench }
export const PROGRAM_SHORT: Record<Program, string> = { warranty: 'GetCover', oem: 'Lenovo', break_fix: 'Break-Fix' }

export const SOURCE_ICON: Record<EventSource, LucideIcon> = {
  UZBL: Sparkles,
  FedEx: Truck,
  'Repair center': Wrench,
  GetCover: ShieldCheck,
  Lenovo: Laptop,
  School: School,
}

const STAGE_ICON: Record<string, LucideIcon> = {
  submitted: Inbox,
  'request.review': FileSearch,
  label_generated: Tag,
  label_sent: Tag,
  in_transit: Truck,
  received: PackageCheck,
  servicer_product_received: PackageCheck,
  in_triage: Stethoscope,
  in_repair: Wrench,
  repair_in_process: Wrench,
  quality_assurance: BadgeCheck,
  repair_complete: CheckCheck,
  returned: Truck,
  delivered: CircleCheck,
  completed: CircleCheck,
  cancelled: CircleX,
}

export const ATTENTION_ICON = { address: MapPinOff, denied: ShieldX, ber: Scale } as const

export const DAMAGE_ICON: Record<Damage, LucideIcon> = {
  screen: Monitor,
  keyboard: Keyboard,
  liquid: Droplets,
  power: Power,
  battery: BatteryWarning,
  hinge: Laptop,
  port: Plug,
  wont_boot: PowerOff,
  software: Code,
  lost_stolen: SearchX,
  other: CircleHelp,
}

/** Two-word labels for pre-check flags, so a row reads at a glance. */
export const FLAG_SHORT: Record<string, { label: string; icon: LucideIcon }> = {
  no_serial: { label: 'No serial', icon: Barcode },
  duplicate: { label: 'Duplicate', icon: Copy },
  unknown_serial: { label: 'Unknown serial', icon: ScanBarcode },
  po_box: { label: 'PO box', icon: MapPinOff },
  lost_stolen: { label: 'Lost or stolen', icon: SearchX },
  needs_description: { label: 'No description', icon: MessageSquareText },
  no_date: { label: 'No date', icon: CalendarX },
  ber_risk: { label: 'BER risk', icon: TriangleAlert },
  oem_accident: { label: 'Accident', icon: Laptop },
  likely_denied_intentional: { label: 'On purpose', icon: Ban },
  likely_denied_no_case: { label: 'No case', icon: ShieldOff },
  likely_denied_defect: { label: 'Defect', icon: Cpu },
  confirm_case: { label: 'Confirm case', icon: ShieldQuestion },
  not_covered: { label: 'No coverage', icon: ShieldAlert },
}

export function stageIcon(stage: string): LucideIcon {
  return STAGE_ICON[stage] ?? Circle
}

export function ticketTone(ticket: ClientTicket): Tone {
  if (ticket.attention) return ticket.attention.kind === 'ber' ? 'warn' : 'bad'
  if (ticket.stage === 'cancelled') return 'idle'
  if (ticket.closed) return 'ok'
  return 'live'
}

export function ticketIcon(ticket: ClientTicket): LucideIcon {
  return ticket.attention ? ATTENTION_ICON[ticket.attention.kind] : stageIcon(ticket.stage)
}

export function ticketHeadline(ticket: ClientTicket): string {
  if (ticket.attention) return ticket.attention.title
  if (ticket.stage === 'cancelled') return 'Claim closed'
  return stageLabel(ticket.program, ticket.stage)
}

/** Rough days until it is back at school, for open repairs. */
export function ticketDaysLeft(ticket: ClientTicket): number | null {
  if (ticket.closed || ticket.attention || ticket.stage === 'cancelled') return null
  const left = STAGES[ticket.program].length - 1 - stageIndex(ticket.program, ticket.stage)
  return Math.max(1, Math.round(left * 0.9))
}

/** "Lenovo 300e Chromebook Gen 4" reads as "Lenovo 300e". */
export function shortModel(model: string | null | undefined): string {
  return model ? model.split(' ').slice(0, 2).join(' ') : 'Unknown device'
}

export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
