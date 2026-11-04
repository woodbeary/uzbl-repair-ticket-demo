// Sample pre-check rules. They stand in for GetCover's real claim guidelines, which UZBL has
// asked for; the point is to catch a likely denial or a bad address before anything is sent.
import type { Credits, Flag, InventoryDevice, Program, Route, RowInput, RowVerdict, TouchType } from './types'
import { findPoBox, looksLikePoBox, levenshtein, normalizeSerial } from './text'


export interface RuleContext {
  inventory: InventoryDevice[]
  credits: Credits
  /** Normalized serial -> first row number that used it, filled in as rows are evaluated in order. */
  seenSerials: Map<string, number>
}

const ROUTE_LABELS: Record<Route, string> = {
  warranty: 'GetCover claim',
  oem: 'Lenovo warranty',
  break_fix: 'Break-Fix credit',
  none: 'Not covered',
  not_repair: 'Not a repair',
}

export function routeLabel(route: Route): string {
  return ROUTE_LABELS[route]
}

export function creditsLeft(credits: Credits, touch: TouchType): number {
  return credits[touch].total - credits[touch].used
}

function touchName(touch: TouchType): string {
  return touch === 'touch' ? 'Touch' : 'Non-Touch'
}

function closestDevice(serial: string, inventory: InventoryDevice[]): InventoryDevice | null {
  let best: InventoryDevice | null = null
  let bestDistance = 3
  for (const device of inventory) {
    const distance = levenshtein(serial, device.serial)
    if (distance < bestDistance) {
      best = device
      bestDistance = distance
    }
  }
  return best
}

function breakFixOffer(device: InventoryDevice, credits: Credits): string {
  return `Use 1 ${touchName(device.touch)} Break-Fix credit instead (${creditsLeft(credits, device.touch)} left). No questions asked.`
}

export function evaluateRow(row: RowInput, ctx: RuleContext): RowVerdict {
  const flags: Flag[] = []
  const serial = normalizeSerial(row.fields.serial.value)
  const { damage, cause, inCase, complete } = row.decisions
  const whatHappened = row.fields.whatHappened.value?.trim() ?? ''

  const verdict = (route: Route, routeReason: string, include = true): RowVerdict => {
    const blocked = flags.some((flag) => flag.level === 'block')
    // A duplicate row is left out anyway, so only its duplicate notice (and real blockers) matter.
    const duplicate = flags.some((flag) => flag.code === 'duplicate')
    return {
      serial,
      device,
      suggestion,
      route,
      routeLabel: routeLabel(route),
      routeReason,
      flags: duplicate ? flags.filter((flag) => flag.code === 'duplicate' || flag.level === 'block') : flags,
      include: include && !blocked && route !== 'none' && route !== 'not_repair',
    }
  }

  let device: InventoryDevice | null = null
  let suggestion: InventoryDevice | null = null

  if (!serial) {
    flags.push({ code: 'no_serial', level: 'block', title: 'No serial number', detail: 'Add the serial from the sticker on the bottom of the device.' })
    return verdict('none', 'We need a serial number to look the device up.')
  }

  const firstUse = ctx.seenSerials.get(serial)
  if (firstUse !== undefined) {
    flags.push({ code: 'duplicate', level: 'warn', title: `Duplicate of row ${firstUse}`, detail: 'Same device listed twice. We kept the first row and left this one out.' })
  } else {
    ctx.seenSerials.set(serial, row.rowNumber)
  }

  device = ctx.inventory.find((candidate) => candidate.serial === serial) ?? null
  if (!device) {
    suggestion = closestDevice(serial, ctx.inventory)
    flags.push({
      code: 'unknown_serial',
      level: 'block',
      title: 'Not in your device inventory',
      detail: suggestion ? `Did you mean ${suggestion.serial} (${suggestion.model}, asset ${suggestion.assetTag})?` : 'Check the serial on the device sticker.',
    })
    return verdict('none', 'Unknown serial number.')
  }

  // An extracted (or edited) ship-to wins; otherwise scan every cell, since PO boxes hide in notes.
  const poBox = row.fields.shipTo.value ? looksLikePoBox(row.fields.shipTo.value) : !!findPoBox(row.cells)
  if (poBox) {
    flags.push({
      code: 'po_box',
      level: 'block',
      title: "FedEx can't use a PO Box",
      detail: 'FedEx pickups and returns need a street address. Use the school address or enter another one.',
    })
  }

  if (damage.value === 'lost_stolen') {
    flags.push({ code: 'lost_stolen', level: 'info', title: 'Lost or stolen, not a repair', detail: 'Your UZBL rep can quote a replacement.' })
    return verdict('not_repair', 'Handled as a replacement, not a repair.', false)
  }

  if (!whatHappened || whatHappened.length < 8 || complete < 0.5) {
    flags.push({ code: 'needs_description', level: 'block', title: 'Needs what happened', detail: 'GetCover and the repair center need what happened, when, and how.' })
  }

  if (!row.fields.incidentDate.value) {
    flags.push({ code: 'no_date', level: 'warn', title: 'When did it happen?', detail: 'No date found. We will use today unless you add one.' })
  }

  if (device.priorRepairs >= 2) {
    flags.push({
      code: 'ber_risk',
      level: 'warn',
      title: `Repair #${device.priorRepairs + 1} on this device`,
      detail: 'It may be declared Beyond Economical Repair. You choose repair or payout before anything is decided.',
    })
  }

  const breakFix = (reason: string): RowVerdict => verdict('break_fix', reason)

  switch (device.coverage) {
    case 'break_fix':
      return breakFix(`Uses 1 ${touchName(device.touch)} credit (${creditsLeft(ctx.credits, device.touch)} left).`)

    case 'oem':
      if (cause.value === 'accidental' || cause.value === 'intentional') {
        flags.push({ code: 'oem_accident', level: 'warn', title: "Lenovo's warranty doesn't cover accidents", detail: breakFixOffer(device, ctx.credits) })
        return breakFix('Accidents are outside the Lenovo warranty.')
      }
      return verdict('oem', 'Hardware fault, no accident. Lenovo pays; your UZBL benefit stays untouched.')

    case 'warranty': {
      if (cause.value === 'intentional') {
        flags.push({ code: 'likely_denied_intentional', level: 'warn', title: 'Likely denied: intentional damage', detail: `The Protection Guarantee excludes intentional damage. ${breakFixOffer(device, ctx.credits)}` })
        return breakFix('Instead of a claim GetCover would likely deny.')
      }
      if (inCase.value === 'no') {
        flags.push({ code: 'likely_denied_no_case', level: 'warn', title: "Likely denied: it wasn't in its UZBL case", detail: `The warranty covers damage the case failed to prevent. ${breakFixOffer(device, ctx.credits)}` })
        return breakFix('Instead of a claim GetCover would likely deny.')
      }
      if (cause.value === 'defect' || cause.value === 'wear') {
        flags.push({ code: 'likely_denied_defect', level: 'warn', title: 'Looks like a defect, not an accident', detail: `GetCover covers accidental damage. ${breakFixOffer(device, ctx.credits)}` })
        return breakFix('Defects are not accidental damage.')
      }
      if (inCase.value === 'unknown') {
        flags.push({ code: 'confirm_case', level: 'info', title: 'Confirm it was in the UZBL case', detail: 'GetCover asks this on every claim.' })
      }
      return verdict('warranty', `Accident in a UZBL case. ${device.coverageLabel}.`)
    }

    default:
      flags.push({
        code: 'not_covered',
        level: 'warn',
        title: 'No coverage on this device',
        detail: 'Break-Fix credits can be bought with a school card, no PO needed (coming soon).',
      })
      return verdict('none', 'No warranty or credits on this device.', false)
  }
}

export function evaluateRows(rows: RowInput[], inventory: InventoryDevice[], credits: Credits): RowVerdict[] {
  const ctx: RuleContext = { inventory, credits, seenSerials: new Map() }
  const verdicts = rows.map((row) => evaluateRow(row, ctx))
  // Duplicates are left out of the submission even when the rest of the row is fine.
  return verdicts.map((verdict) => (verdict.flags.some((flag) => flag.code === 'duplicate') ? { ...verdict, include: false } : verdict))
}

/** Break-Fix credits a set of included rows would use, by touch type. */
export function creditsNeeded(rows: { include: boolean; route: Route; device: InventoryDevice | null }[]): Record<TouchType, number> {
  const needed: Record<TouchType, number> = { touch: 0, non_touch: 0 }
  for (const row of rows) {
    if (row.include && row.route === 'break_fix' && row.device) needed[row.device.touch]++
  }
  return needed
}

export function isProgram(route: Route): route is Program {
  return route === 'warranty' || route === 'oem' || route === 'break_fix'
}
