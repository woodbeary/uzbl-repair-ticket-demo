// Fresh demo sandbox: six repairs that between them show every tracker state, including the
// three problems the calls kept coming back to (PO box, GetCover denial reason, BER payout).
import { INITIAL_CREDITS, SCHOOL, findDevice } from '../shared/inventory'
import type { DemoState, Program, ScriptStep, Ticket, TicketEvent } from '../shared/types'
import { scriptFor } from './tracker'

const HOUR = 3600_000

function base(id: string, program: Program, serial: string, issue: Ticket['issue'], createdAt: Date, extra: Partial<Ticket> = {}): Ticket {
  const device = findDevice(serial)!
  return {
    id,
    program,
    device: { serial, model: device.model, assetTag: device.assetTag, school: device.school, touch: device.touch },
    issue,
    submittedBy: SCHOOL.contact,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    stage: 'submitted',
    closed: false,
    shipTo: SCHOOL.address,
    events: [],
    script: [],
    ...extra,
  }
}

function play(ticket: Ticket, steps: (ScriptStep & { hoursAgo: number })[], now: Date) {
  for (const step of steps) {
    const at = new Date(now.getTime() - step.hoursAgo * HOUR).toISOString()
    const entry: TicketEvent = { at, source: step.source, title: step.title, detail: step.detail, stage: step.stage, kind: step.kind ?? 'normal', notify: step.notify }
    ticket.events.push(entry)
    if (step.stage) ticket.stage = step.stage
    ticket.updatedAt = at
  }
}

/** Drops the script steps the seeded history has already played. */
function remaining(ticket: Ticket): ScriptStep[] {
  const script = scriptFor(ticket.program, ticket)
  const played = new Set(ticket.events.map((event) => event.stage).filter(Boolean))
  return script.filter((step) => !step.stage || !played.has(step.stage))
}

export function seedState(now = new Date()): DemoState {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR)
  const tickets: Ticket[] = []
  const submitted = (hoursAgo: number, via = 'the portal') => ({
    hoursAgo,
    source: 'UZBL' as const,
    title: 'Submitted',
    detail: `By ${SCHOOL.contact.name}, from ${via}.`,
    stage: 'submitted',
    notify: true,
  })

  // 1. Break-Fix, mid-repair.
  const inRepair = base('UZ-24791', 'break_fix', 'PF3XJ9A4', { damage: 'screen', whatHappened: 'Screen cracked after it slid off a desk in the library', incidentDate: ago(130).toISOString().slice(0, 10), location: 'Library' }, ago(122), { trackingNumber: '794612058831' })
  play(inRepair, [
    submitted(122),
    { hoursAgo: 122, source: 'FedEx', title: 'Label ready', detail: 'Tracking 794612058831. 1 Touch credit used.', stage: 'label_generated' },
    { hoursAgo: 98, source: 'FedEx', title: 'Picked up', detail: 'Left Pinecrest, CO. Tracking 794612058831.', stage: 'in_transit', notify: true },
    { hoursAgo: 52, source: 'Repair center', title: 'Checked in', detail: 'FedEx repair depot, Memphis, TN. Serial verified.', stage: 'received', notify: true },
    { hoursAgo: 30, source: 'Repair center', title: 'Diagnosing', detail: 'Technician confirmed: screen assembly.', stage: 'in_triage' },
    { hoursAgo: 6, source: 'Repair center', title: 'Repairing screen', detail: 'Replacement screen installed, now in testing.', stage: 'in_repair' },
  ], now)
  inRepair.script = remaining(inRepair)
  tickets.push(inRepair)

  // 2. FedEx label failed on a PO box. Prod swallows this error today; here it stops and asks.
  const poBox = base('UZ-24795', 'break_fix', 'PF3XJ9C2', { damage: 'keyboard', whatHappened: 'Several keys came off after a student spilled glitter glue', incidentDate: ago(60).toISOString().slice(0, 10), location: 'Art room' }, ago(50), { shipTo: 'PO Box 1187, Pinecrest, CO 80999' })
  poBox.device.school = 'Alder Elementary'
  play(poBox, [
    submitted(50),
    {
      hoursAgo: 50,
      source: 'FedEx',
      title: 'Label failed',
      detail: 'The ship-to address is a PO box. FedEx needs a street address for pickups and returns.',
      kind: 'problem',
      notify: true,
    },
  ], now)
  poBox.attention = {
    kind: 'address',
    title: 'Can’t ship to a PO box',
    tag: 'PO Box 1187',
    body: "FedEx can't pick up from a PO box. Use a street address and the label is created right away.",
    suggestedAddress: 'Alder Elementary, 220 Aspen Way, Pinecrest, CO 80999',
  }
  tickets.push(poBox)

  // 3. GetCover denied the claim; the reason is shown instead of buried in an admin email.
  const denied = base('UZ-24793', 'warranty', 'PF3XJ9D5', { damage: 'screen', whatHappened: 'Dropped in the parking lot, screen shattered', incidentDate: ago(110).toISOString().slice(0, 10), location: 'Parking lot' }, ago(100), { claimNumber: 'GC-24793-J9D5' })
  play(denied, [
    submitted(100),
    { hoursAgo: 100, source: 'GetCover', title: 'Claim filed', detail: 'GC-24793-J9D5. Most claims are decided within 1 business day.', stage: 'request.review' },
    { hoursAgo: 20, source: 'GetCover', title: 'Claim denied', detail: 'Reason from GetCover: the device was not in its UZBL case when it was damaged.', stage: 'cancelled', kind: 'problem', notify: true },
  ], now)
  denied.attention = {
    kind: 'denied',
    title: 'Claim denied',
    tag: 'No case at time of damage',
    reason: 'Damage happened while the device was out of its UZBL case (photos show no case on the device). The Protection Guarantee covers damage the case failed to prevent.',
    body: 'You can still get it fixed today.',
    options: [
      { id: 'use_credit', label: 'Use a credit', detail: 'Any damage, no questions asked. The FedEx label is created now.', primary: true },
      { id: 'appeal', label: 'Appeal', detail: 'Your UZBL rep sends GetCover the case details and photos.' },
    ],
  }
  tickets.push(denied)

  // 4. Third repair on the same device: the school decides before any payout happens.
  const ber = base('UZ-24797', 'warranty', 'PF3XJ9E8', { damage: 'screen', whatHappened: 'Screen cracked again, dropped on the bus', incidentDate: ago(80).toISOString().slice(0, 10), location: 'Bus' }, ago(76), { claimNumber: 'GC-24797-J9E8', trackingNumber: '794612077104' })
  play(ber, [
    submitted(76),
    { hoursAgo: 76, source: 'GetCover', title: 'Claim filed', detail: 'GC-24797-J9E8. Under review.', stage: 'request.review' },
    { hoursAgo: 60, source: 'GetCover', title: 'Approved · label sent', detail: 'Ship it with the FedEx label (tracking 794612077104).', stage: 'label_sent', notify: true },
    { hoursAgo: 14, source: 'Repair center', title: 'Received', detail: 'Checked in and photographed on arrival.', stage: 'servicer_product_received', notify: true },
    { hoursAgo: 3, source: 'GetCover', title: 'Decision needed', detail: '3rd repair on this device. Repair costs are close to its value (Beyond Economical Repair).', kind: 'decision', notify: true },
  ], now)
  ber.attention = {
    kind: 'ber',
    title: 'Repair or payout?',
    tag: '3rd repair this year',
    body: 'This Lenovo 300e has been repaired twice this year. Today GetCover would just pay out. Here you choose.',
    options: [
      { id: 'repair', label: 'Repair', detail: 'Covered by the remaining warranty benefit. Back in about 5 days.', primary: true },
      { id: 'payout', label: 'Payout', detail: 'The device is recycled for parts.' },
      { id: 'replace', label: 'Replace', detail: 'Quote for a new device with case and warranty, minus the payout.' },
    ],
  }
  tickets.push(ber)

  // 5. Shipped back, one step from done.
  const shipped = base('UZ-24790', 'break_fix', '5CD2339JM4', { damage: 'port', whatHappened: 'Charging port loose, only charges at an angle', incidentDate: ago(200).toISOString().slice(0, 10), location: 'Room 118' }, ago(190), { trackingNumber: '794611987452' })
  play(shipped, [
    submitted(190),
    { hoursAgo: 190, source: 'FedEx', title: 'Label ready', detail: 'Tracking 794611987452. 1 Non-Touch credit used.', stage: 'label_generated' },
    { hoursAgo: 170, source: 'FedEx', title: 'Picked up', detail: 'Left Pinecrest, CO.', stage: 'in_transit', notify: true },
    { hoursAgo: 124, source: 'Repair center', title: 'Checked in', detail: 'FedEx repair depot, Memphis, TN.', stage: 'received', notify: true },
    { hoursAgo: 100, source: 'Repair center', title: 'Diagnosing', detail: 'Technician confirmed: charging port.', stage: 'in_triage' },
    { hoursAgo: 75, source: 'Repair center', title: 'Repairing port', detail: 'Port board replaced.', stage: 'in_repair' },
    { hoursAgo: 52, source: 'Repair center', title: 'Quality check passed', detail: 'Charged, booted and tested.', stage: 'quality_assurance' },
    { hoursAgo: 26, source: 'FedEx', title: 'Shipped back', detail: 'FedEx Ground, tracking 794611990318. Arrives tomorrow.', stage: 'returned', notify: true },
  ], now)
  shipped.script = remaining(shipped)
  tickets.push(shipped)

  // 6. A finished GetCover claim.
  const done = base('UZ-24788', 'warranty', 'PF3XJ9B7', { damage: 'liquid', whatHappened: 'Water bottle leaked in the backpack, keyboard stopped working', incidentDate: ago(330).toISOString().slice(0, 10), location: 'Home' }, ago(320), { claimNumber: 'GC-24788-J9B7' })
  play(done, [
    submitted(320),
    { hoursAgo: 320, source: 'GetCover', title: 'Claim filed', detail: 'GC-24788-J9B7. Under review.', stage: 'request.review' },
    { hoursAgo: 300, source: 'GetCover', title: 'Approved · label sent', stage: 'label_sent', notify: true },
    { hoursAgo: 250, source: 'Repair center', title: 'Received', stage: 'servicer_product_received', notify: true },
    { hoursAgo: 200, source: 'Repair center', title: 'Repairing liquid', detail: 'Keyboard and top case replaced.', stage: 'repair_in_process' },
    { hoursAgo: 150, source: 'GetCover', title: 'Repair complete', stage: 'repair_complete', notify: true },
    { hoursAgo: 140, source: 'FedEx', title: 'Shipped back', stage: 'returned', notify: true },
    { hoursAgo: 96, source: 'FedEx', title: 'Delivered', detail: 'Signed for at the front office. Claim closed.', stage: 'completed', notify: true },
  ], now)
  done.closed = true
  tickets.push(done)

  tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { school: SCHOOL, credits: structuredClone(INITIAL_CREDITS), tickets }
}
