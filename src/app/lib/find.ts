// Quick find: type whatever identifier is on hand (serial, ticket, asset tag, FedEx tracking or
// claim number) and get the matching repairs, best match first. Dashes and spaces don't matter.
import type { ClientTicket } from '@/shared/types'

export type FindField = 'serial' | 'ticket' | 'asset' | 'tracking' | 'claim'

export const FIELD_LABEL: Record<FindField, string> = { serial: 'Serial', ticket: 'Ticket', asset: 'Asset tag', tracking: 'Tracking', claim: 'Claim' }

export interface FindMatch {
  ticket: ClientTicket
  field: FindField
  value: string
  /** The matched characters of `value`, as [start, end). */
  range: [number, number]
  exact: boolean
}

// Also the tie-break order: a serial match beats a ticket match, and so on.
const FIELDS: FindField[] = ['serial', 'ticket', 'asset', 'tracking', 'claim']

/** Upper-case letters and digits only, so "uz 24795", "UZ-24795" and "7946 1205 8831" all match. */
export function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function valueOf(ticket: ClientTicket, field: FindField): string | undefined {
  if (field === 'serial') return ticket.device.serial
  if (field === 'ticket') return ticket.id
  if (field === 'asset') return ticket.device.assetTag
  if (field === 'tracking') return ticket.trackingNumber
  return ticket.claimNumber
}

/** Maps a range of the normalized value back onto the value as written, skipping dashes and spaces. */
function writtenRange(value: string, start: number, length: number): [number, number] {
  let seen = 0
  let from = 0
  for (let i = 0; i < value.length; i++) {
    if (!/[A-Za-z0-9]/.test(value[i])) continue
    if (seen === start) from = i
    seen++
    if (seen === start + length) return [from, i + 1]
  }
  return [0, value.length]
}

export function findTickets(tickets: ClientTicket[], query: string, limit = 5): FindMatch[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const found: { match: FindMatch; score: number }[] = []
  for (const ticket of tickets) {
    let best: { match: FindMatch; score: number } | null = null
    for (const [priority, field] of FIELDS.entries()) {
      const value = valueOf(ticket, field)
      if (!value) continue
      const plain = normalize(value)
      const at = plain.indexOf(q)
      if (at < 0) continue
      const exact = plain === q
      const score = (exact ? 0 : at === 0 ? 10 : 20) + priority
      if (!best || score < best.score) best = { match: { ticket, field, value, range: writtenRange(value, at, q.length), exact }, score }
    }
    if (best) found.push(best)
  }
  return found
    .sort((a, b) => a.score - b.score || b.match.ticket.updatedAt.localeCompare(a.match.ticket.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.match)
}

/**
 * Reads like an identifier rather than a sentence about a repair: it has a digit, and every word
 * either has a digit or is a short prefix ("uz 24793", "PVH 10401", "7946 1205 8831"). "PF3XK2L9
 * screen cracked" has real words in it, so it is a description to read, not something to look up.
 */
export function looksLikeId(query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length || query.trim().length > 40 || !/\d/.test(query)) return false
  return words.every((word) => /\d/.test(word) || /^[A-Za-z]{1,3}[-#:]?$/.test(word))
}
