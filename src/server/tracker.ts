// Repair tracker state machine. Each ticket carries a script of upcoming events; "Next update"
// plays the next one. Problems (a PO-box label failure, a GetCover denial, a BER decision) stop the
// script until the school acts, which is the point: nothing fails silently.
import { SCHOOL, findDevice } from '../shared/inventory'
import { DAMAGE } from '../shared/labels'
import { creditsLeft } from '../shared/rules'
import { PROGRAM_LABELS } from '../shared/stages'
import { looksLikePoBox } from '../shared/text'
import type { DemoState, Program, ScriptStep, SubmissionRow, Ticket, TicketEvent } from '../shared/types'

export class TrackerError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

let fedexSeq = 0
export function trackingNumber(seed: string): string {
  let hash = 0
  for (const ch of seed + fedexSeq++) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `7946${String(hash).padStart(10, '0').slice(0, 8)}`
}

function event(step: ScriptStep, at: string): TicketEvent {
  return { at, source: step.source, title: step.title, detail: step.detail, stage: step.stage, kind: step.kind ?? 'normal', notify: step.notify }
}

export function scriptFor(program: Program, ticket: Pick<Ticket, 'device' | 'issue' | 'trackingNumber'>): ScriptStep[] {
  const part = DAMAGE[ticket.issue.damage]?.label.toLowerCase() ?? 'repair'
  const tracking = ticket.trackingNumber ?? trackingNumber(ticket.device.serial)
  if (program === 'warranty') {
    return [
      { stage: 'label_sent', source: 'GetCover', title: 'Approved · label sent', detail: `Claim approved. Ship it with the prepaid FedEx label (tracking ${tracking}).`, notify: true },
      { stage: 'servicer_product_received', source: 'Repair center', title: 'Received', detail: 'Checked in and photographed by the repair partner.', notify: true },
      { stage: 'repair_in_process', source: 'Repair center', title: `Repairing ${part}`, detail: 'Parts in stock. Usually 3 to 5 business days.' },
      { stage: 'repair_complete', source: 'GetCover', title: 'Repair complete', detail: 'Tested and packed to ship.', notify: true },
      { stage: 'returned', source: 'FedEx', title: 'Shipped back', detail: `FedEx Ground, tracking ${trackingNumber(tracking)}. About 2 days.`, notify: true },
      { stage: 'completed', source: 'FedEx', title: 'Delivered', detail: 'Signed for at the front office. Claim closed.', notify: true },
    ]
  }
  const depot = program === 'oem' ? 'Lenovo depot' : 'FedEx repair depot, Memphis, TN'
  const repairer: ScriptStep['source'] = program === 'oem' ? 'Lenovo' : 'Repair center'
  const steps: ScriptStep[] = [
    { stage: 'in_transit', source: 'FedEx', title: 'Picked up', detail: `Left Pinecrest, CO. Tracking ${tracking}.`, notify: true },
    { stage: 'received', source: repairer, title: 'Checked in', detail: `${depot}. Serial verified.`, notify: true },
  ]
  if (program === 'break_fix') steps.push({ stage: 'in_triage', source: repairer, title: 'Diagnosing', detail: `Technician confirmed: ${part}.` })
  steps.push({ stage: 'in_repair', source: repairer, title: `Repairing ${part}`, detail: program === 'oem' ? 'Covered by the manufacturer warranty.' : 'Replacement part installed.' })
  if (program === 'break_fix') steps.push({ stage: 'quality_assurance', source: repairer, title: 'Quality check passed', detail: 'Charged, booted and tested.' })
  steps.push(
    { stage: 'returned', source: 'FedEx', title: 'Shipped back', detail: `FedEx Ground, tracking ${trackingNumber(tracking)}. About 2 days.`, notify: true },
    { stage: 'delivered', source: 'FedEx', title: 'Delivered', detail: 'Signed for at the front office.', notify: true }
  )
  return steps
}

export function ticketId(state: DemoState): string {
  const highest = state.tickets.reduce((max, ticket) => Math.max(max, Number(ticket.id.replace(/\D/g, '')) || 0), 24800)
  return `UZ-${highest + 1}`
}

export function createTickets(state: DemoState, rows: SubmissionRow[], now = new Date()): Ticket[] {
  const at = now.toISOString()
  const created: Ticket[] = []
  for (const row of rows) {
    const device = findDevice(row.serial)
    if (!device) throw new TrackerError(`Row ${row.rowNumber}: ${row.serial} is not in your inventory`)
    if (row.shipTo && looksLikePoBox(row.shipTo)) throw new TrackerError(`Row ${row.rowNumber}: FedEx can't ship to a PO Box`)
    if ((row.whatHappened ?? '').trim().length < 8) throw new TrackerError(`Row ${row.rowNumber}: add what happened first`)
    if (row.route === 'break_fix') {
      if (creditsLeft(state.credits, device.touch) < 1) throw new TrackerError(`Row ${row.rowNumber}: no ${device.touch === 'touch' ? 'Touch' : 'Non-Touch'} credits left`)
      state.credits[device.touch].used++
    }

    const ticket: Ticket = {
      id: ticketId(state),
      program: row.route,
      device: { serial: device.serial, model: device.model, assetTag: device.assetTag, school: device.school, touch: device.touch },
      issue: { damage: row.damage, whatHappened: row.whatHappened, incidentDate: row.incidentDate, location: row.location },
      submittedBy: SCHOOL.contact,
      createdAt: at,
      updatedAt: at,
      stage: row.route === 'warranty' ? 'request.review' : 'label_generated',
      closed: false,
      shipTo: row.shipTo || SCHOOL.address,
      events: [],
      script: [],
    }
    ticket.trackingNumber = trackingNumber(ticket.id)
    if (row.route === 'warranty') ticket.claimNumber = `GC-${ticket.id.slice(3)}-${device.serial.slice(-4)}`

    ticket.events.push({
      at,
      source: 'UZBL',
      title: 'Submitted',
      detail: `By ${SCHOOL.contact.name}, from a spreadsheet. Routed to ${PROGRAM_LABELS[row.route]}; pre-check passed.`,
      stage: row.route === 'warranty' ? undefined : 'submitted',
      notify: true,
    })
    if (row.route === 'warranty') {
      ticket.events.push({ at, source: 'GetCover', title: 'Claim filed', detail: `${ticket.claimNumber}. Most claims are decided within 1 business day.`, stage: 'request.review' })
    } else {
      ticket.events.push({
        at,
        source: 'FedEx',
        title: 'Label ready',
        detail: `Tracking ${ticket.trackingNumber}. Print it and box the device.${row.route === 'break_fix' ? ` 1 ${device.touch === 'touch' ? 'Touch' : 'Non-Touch'} credit used.` : ''}`,
        stage: 'label_generated',
      })
    }
    ticket.script = scriptFor(row.route, ticket)
    state.tickets.unshift(ticket)
    created.push(ticket)
  }
  return created
}

export function advance(ticket: Ticket, now = new Date()): Ticket {
  if (ticket.attention) throw new TrackerError('This repair is waiting on you. Resolve the card above first.', 409)
  const step = ticket.script.shift()
  if (!step) {
    ticket.closed = true
    return ticket
  }
  const at = now.toISOString()
  ticket.events.push(event(step, at))
  if (step.stage) ticket.stage = step.stage
  if (step.attention) ticket.attention = step.attention
  if (!ticket.script.length && !ticket.attention) ticket.closed = true
  ticket.updatedAt = at
  return ticket
}

export function fixAddress(ticket: Ticket, address: string, now = new Date()): Ticket {
  if (ticket.attention?.kind !== 'address') throw new TrackerError('Nothing to fix on this repair.')
  if (looksLikePoBox(address) || address.trim().length < 10) throw new TrackerError('Enter a street address. FedEx cannot pick up from a PO Box.')
  const at = now.toISOString()
  ticket.shipTo = address.trim()
  ticket.attention = undefined
  ticket.trackingNumber = trackingNumber(ticket.id + address)
  ticket.events.push(
    { at, source: 'School', title: 'Address updated', detail: `${SCHOOL.contact.name}: ${ticket.shipTo}`, kind: 'resolved' },
    { at, source: 'FedEx', title: 'Label ready', detail: `Tracking ${ticket.trackingNumber}. Pickup back on schedule.`, stage: 'label_generated', kind: 'resolved', notify: true }
  )
  ticket.stage = 'label_generated'
  ticket.script = scriptFor(ticket.program, ticket)
  ticket.updatedAt = at
  return ticket
}

export function decide(state: DemoState, ticket: Ticket, option: string, now = new Date()): Ticket {
  const attention = ticket.attention
  if (!attention || attention.kind === 'address') throw new TrackerError('There is no decision waiting on this repair.')
  const at = now.toISOString()
  const name = SCHOOL.contact.name

  if (attention.kind === 'denied') {
    if (option === 'use_credit') {
      if (creditsLeft(state.credits, ticket.device.touch) < 1) throw new TrackerError('No credits left for this device type.')
      state.credits[ticket.device.touch].used++
      ticket.program = 'break_fix'
      ticket.trackingNumber = trackingNumber(ticket.id + 'bf')
      ticket.events.push(
        { at, source: 'School', title: 'Credit used', detail: `${name} used 1 ${ticket.device.touch === 'touch' ? 'Touch' : 'Non-Touch'} Break-Fix credit. No claim needed.`, kind: 'decision' },
        { at, source: 'FedEx', title: 'Label ready', detail: `Tracking ${ticket.trackingNumber}.`, stage: 'label_generated', notify: true }
      )
      ticket.stage = 'label_generated'
      ticket.script = scriptFor('break_fix', ticket)
    } else if (option === 'appeal') {
      ticket.events.push({
        at,
        source: 'UZBL',
        title: 'Appeal requested',
        detail: `${name} asked UZBL to appeal. Your rep sends GetCover the photos and case details within 2 business days.`,
        kind: 'decision',
        notify: true,
      })
      ticket.closed = true
    } else {
      throw new TrackerError('Unknown option.')
    }
  } else if (attention.kind === 'ber') {
    if (option === 'repair') {
      ticket.events.push({
        at,
        source: 'School',
        title: 'Repair approved',
        detail: `${name} chose the repair, covered by the remaining warranty benefit.`,
        kind: 'decision',
        stage: 'repair_in_process',
        notify: true,
      })
      ticket.stage = 'repair_in_process'
      ticket.script = scriptFor('warranty', ticket).slice(3)
    } else if (option === 'payout') {
      ticket.events.push(
        { at, source: 'School', title: 'Payout chosen', detail: `${name} took the payout. The device is recycled for parts.`, kind: 'decision', notify: true },
        { at, source: 'GetCover', title: 'Closed with payout', detail: 'Payout credited. Device marked beyond economical repair.', stage: 'completed' }
      )
      ticket.stage = 'completed'
      ticket.script = []
      ticket.closed = true
    } else if (option === 'replace') {
      ticket.events.push(
        { at, source: 'School', title: 'Replacement requested', detail: `${name} asked for a quote: a new Lenovo 300e with case and warranty, minus the payout.`, kind: 'decision', notify: true },
        { at, source: 'GetCover', title: 'Closed with payout', detail: 'Payout applied to the replacement quote.', stage: 'completed' }
      )
      ticket.stage = 'completed'
      ticket.script = []
      ticket.closed = true
    } else {
      throw new TrackerError('Unknown option.')
    }
  }
  ticket.attention = undefined
  ticket.updatedAt = at
  return ticket
}
