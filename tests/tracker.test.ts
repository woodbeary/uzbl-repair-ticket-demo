import { describe, expect, it } from 'vitest'
import { seedState } from '../src/server/seed'
import { TrackerError, advance, createTickets, decide, fixAddress } from '../src/server/tracker'

const now = new Date('2026-10-23T18:00:00Z')

describe('seeded sandbox', () => {
  it('covers every tracker state', () => {
    const state = seedState(now)
    expect(state.tickets).toHaveLength(6)
    expect(state.tickets.map((ticket) => ticket.attention?.kind).filter(Boolean).sort()).toEqual(['address', 'ber', 'denied'])
    expect(state.tickets.find((ticket) => ticket.id === 'UZ-24791')?.script.map((step) => step.stage)).toEqual(['quality_assurance', 'returned', 'delivered'])
  })
})

describe('tracker', () => {
  it('plays the script one update at a time until delivered', () => {
    const ticket = seedState(now).tickets.find((candidate) => candidate.id === 'UZ-24791')!
    advance(ticket, now)
    expect(ticket.stage).toBe('quality_assurance')
    advance(ticket, now)
    advance(ticket, now)
    expect(ticket.stage).toBe('delivered')
    expect(ticket.closed).toBe(true)
  })

  it('blocks on the PO box until a street address is given', () => {
    const ticket = seedState(now).tickets.find((candidate) => candidate.id === 'UZ-24795')!
    expect(() => advance(ticket, now)).toThrow(TrackerError)
    expect(() => fixAddress(ticket, 'P.O. Box 9, Pinecrest CO', now)).toThrow(/PO Box/)
    fixAddress(ticket, 'Alder Elementary, 220 Aspen Way, Pinecrest, CO 80999', now)
    expect(ticket.stage).toBe('label_generated')
    expect(ticket.attention).toBeUndefined()
    advance(ticket, now)
    expect(ticket.stage).toBe('in_transit')
  })

  it('turns a denied claim into a Break-Fix repair with one credit', () => {
    const state = seedState(now)
    const ticket = state.tickets.find((candidate) => candidate.id === 'UZ-24793')!
    const usedBefore = state.credits.touch.used
    decide(state, ticket, 'use_credit', now)
    expect(ticket.program).toBe('break_fix')
    expect(state.credits.touch.used).toBe(usedBefore + 1)
    advance(ticket, now)
    expect(ticket.stage).toBe('in_transit')
  })

  it('lets the school choose repair or payout on a BER device', () => {
    const state = seedState(now)
    const repair = state.tickets.find((candidate) => candidate.id === 'UZ-24797')!
    decide(state, repair, 'repair', now)
    expect(repair.stage).toBe('repair_in_process')
    expect(repair.script[0].stage).toBe('repair_complete')

    const payout = seedState(now).tickets.find((candidate) => candidate.id === 'UZ-24797')!
    decide(seedState(now), payout, 'payout', now)
    expect(payout.closed).toBe(true)
  })

  it('creates tickets from a submission and re-checks the address', () => {
    const state = seedState(now)
    const created = createTickets(state, [
      { rowNumber: 4, serial: 'PF3XK2L9', route: 'warranty', whatHappened: 'dropped it off the bleachers', incidentDate: '2026-10-03', location: 'gym', shipTo: null, damage: 'screen' },
      { rowNumber: 16, serial: '5CD2341KR2', route: 'break_fix', whatHappened: 'charging port loose', incidentDate: null, location: null, shipTo: null, damage: 'port' },
    ], now)
    expect(created.map((ticket) => ticket.stage)).toEqual(['request.review', 'label_generated'])
    expect(state.credits.non_touch.used).toBe(42)
    expect(new Set(state.tickets.map((ticket) => ticket.id)).size).toBe(state.tickets.length)
    expect(() =>
      createTickets(state, [{ rowNumber: 14, serial: 'PF3XK2S3', route: 'warranty', whatHappened: 'keys popped off', incidentDate: null, location: null, shipTo: 'PO Box 1187', damage: 'keyboard' }], now)
    ).toThrow(/PO Box/)
  })
})
