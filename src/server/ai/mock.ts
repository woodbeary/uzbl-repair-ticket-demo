// Keyword stand-ins for Clef and Clairic that return the same response shapes. Used for local
// dev and tests, and as a backup if a live model call fails mid-demo (the UI says when).
import { parseLooseDate } from '../../shared/text'
import type { ClairicAnswer, ClairicRequest, ClairicResponse, ClefAnswer, ClefQuestion, ClefResponse } from './models'

const SERIAL_TOKEN = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{7,12}\b/g

function choice(options: string[], chosen: string, confidence = 0.92): ClefAnswer {
  const rest = (1 - confidence) / Math.max(1, options.length - 1)
  const probabilities = Object.fromEntries(options.map((option) => [option, option === chosen ? confidence : rest]))
  return { type: 'choice', choice: chosen, probabilities, confidence }
}

export function classifyColumn(header: string, examples: string[]): string {
  const h = header.toLowerCase()
  if (/teacher|staff|contact|e-?mail|submitted by|reported by/.test(h)) return 'staff_contact'
  if (/\bkid\b|student|\bname\b/.test(h)) return 'student_name'
  if (/s\/n|serial|\bsn\b/.test(h)) return 'serial_number'
  if (/asset|tag|inventory/.test(h)) return 'asset_tag'
  if (/model|device/.test(h)) return 'device_model'
  if (/touch/.test(h)) return 'touch_type'
  if (/what|happen|issue|problem|damage|descri/.test(h)) return 'what_happened'
  if (/when|date/.test(h)) return 'incident_date'
  if (/where|location|room/.test(h)) return 'location'
  if (/case/.test(h)) return 'in_case'
  if (/ship|address|return/.test(h)) return 'ship_to_address'
  if (/note|comment/.test(h)) return 'notes'
  if (examples.length && examples.every((value) => /^[A-Z0-9]{7,14}$/.test(value))) return 'serial_number'
  return 'ignore'
}

function pairs(state: string): [string, string][] {
  return state
    .split('\n')
    .map((line) => line.match(/^([^:]{1,40}):\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => !!match && !/^today/i.test(match[1]))
    .map((match) => [match[1].trim(), match[2].trim()])
}

function valueFor(state: string, header: RegExp): string {
  return pairs(state).find(([key, value]) => header.test(key.toLowerCase()) && value)?.[1] ?? ''
}

function reportText(state: unknown): string {
  return (typeof state === 'string' ? state : JSON.stringify(state)).toLowerCase()
}

function damageOf(text: string): string {
  if (/stolen|\blost\b|missing/.test(text)) return 'lost_stolen'
  if (/spill|water|liquid|gatorade|juice|soda|coffee/.test(text)) return 'liquid'
  if (/battery|swollen/.test(text)) return 'battery'
  if (/charging port|\bport\b|at an angle/.test(text)) return 'port'
  if (/hinge|housing|bezel|\blid\b/.test(text)) return 'hinge'
  if (/\bkeys?\b|keyboard|trackpad|touchpad/.test(text)) return 'keyboard'
  if (/screen|display|went black|lcd/.test(text)) return 'screen'
  if (/charg|power/.test(text)) return 'power'
  if (/turn on|boot/.test(text)) return 'wont_boot'
  if (/software|update|log ?in|password/.test(text)) return 'software'
  return 'other'
}

function causeOf(text: string): string {
  if (/threw|thrown|vandal|on purpose|fight|punch|kick|smash/.test(text)) return 'intentional'
  if (/on its own|no drop|no damage|stopped|went black|won't charge|doesn't click|swollen|it just broke/.test(text)) return 'defect'
  if (/at an angle|loose|worn/.test(text)) return 'wear'
  if (/drop|fell|knock|spill|crack|crush|stepped|bleachers|backpack|snapped|picking/.test(text)) return 'accidental'
  return 'unknown'
}

function inCaseOf(state: unknown): string {
  const text = reportText(state)
  const caseValue = typeof state === 'string' ? valueFor(state, /case/).toLowerCase() : ''
  if (/^(yes|y|yep|yeah)\b/.test(caseValue) || /was in (the|its|a)[\w\s]*case/.test(text)) return 'yes'
  if (/^(no|n)\b|off|without|no case/.test(caseValue) || /not in (the|its) case|case was off|without (a|the|its) case/.test(text)) return 'no'
  return 'unknown'
}

function completeOf(state: unknown): number {
  const text = typeof state === 'string' ? valueFor(state, /what|happen|issue|problem|descri/) : ''
  if (!text) return 0.06
  if (text.length < 12 || /^(broken|fix|pls fix|asap|n\/a)\b/i.test(text)) return 0.15
  return 0.93
}

export function mockClef(state: unknown, questions: Record<string, ClefQuestion>): ClefResponse {
  const text = reportText(state)
  const answers: Record<string, ClefAnswer> = {}
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === 'noul') {
      answers[id] = { type: 'noul', noul: completeOf(state) }
      continue
    }
    if (question.type !== 'choice') continue
    const options = Object.keys(question.criteria)
    if (id.startsWith('col_')) {
      const instructions = question.instructions as { column_header?: string; example_values?: string[] }
      answers[id] = choice(options, classifyColumn(instructions.column_header ?? '', instructions.example_values ?? []), 0.9)
    } else if (id === 'damage') {
      answers[id] = choice(options, damageOf(text))
    } else if (id === 'cause') {
      answers[id] = choice(options, causeOf(text), 0.86)
    } else if (id === 'in_case') {
      answers[id] = choice(options, inCaseOf(state), 0.88)
    }
  }
  return { model: 'mock-clef', answers, usage: { input_tokens: Math.ceil(text.length / 4), output_tokens: 0 } }
}

export function mockClairic(request: ClairicRequest): ClairicResponse {
  if (request.images?.length) throw new Error('Reading screenshots needs the live Clairic model.')
  const state = request.state ?? ''
  const today = request.reference_date ?? new Date().toISOString().slice(0, 10)
  const answers: Record<string, ClairicAnswer> = {}

  const answer = (type: string, value: string | null, spanText?: string): ClairicAnswer => {
    const start = value ? state.indexOf(spanText ?? value) : -1
    return {
      type,
      value,
      confidence: value ? 0.94 : 0.45,
      p_null: value ? 0.02 : 0.97,
      ...(start >= 0 ? { span: [start, start + (spanText ?? value ?? '').length] as [number, number] } : {}),
    }
  }

  // Free text (a pasted email): the pipeline asks about one serial at a time, so read just its sentence.
  const anchor = Object.values(request.fields).map((field) => field.instructions?.match(/serial (\w+) only/)?.[1]).find(Boolean)
  const sentence = anchor ? (state.split(/(?<=[.!?\n])\s+/).find((part) => part.toUpperCase().includes(anchor)) ?? '') : ''
  const prose = sentence
    .replace(/^\s*(hi|hey|hello)\b[^,]*,\s*/i, '')
    .replace(new RegExp(anchor ?? '^$', 'i'), '')
    .replace(/^[\s,:;-]+|[\s,:;-]+$/g, '')

  for (const [name, field] of Object.entries(request.fields)) {
    if (field.type === 'list') {
      const values = [...new Set(state.toUpperCase().match(SERIAL_TOKEN) ?? [])]
      answers[name] = { type: 'list', value: values, confidence: 0.9 }
      continue
    }
    let value = ''
    switch (name) {
      case 'serial_number':
        value = anchor ?? (valueFor(state, /s\/n|serial|\bsn\b/) || (state.match(SERIAL_TOKEN)?.[0] ?? ''))
        break
      case 'asset_tag':
        value = valueFor(state, /asset|tag/)
        break
      case 'device_model':
        value = valueFor(state, /model|device/)
        break
      case 'what_happened':
        value = valueFor(state, /what|happen|issue|problem|descri/) || (prose.length >= 8 ? prose : '')
        break
      case 'location':
        value = valueFor(state, /where|location|room/)
        break
      case 'ship_to': {
        value = valueFor(state, /ship|address|return/)
        if (!value) value = (sentence || state).match(/(?:p[\s.-]*o[\s.-]*box|post\s+office\s+box)\s*#?\s*\d+[^\n]*/i)?.[0] ?? ''
        break
      }
      case 'incident_date': {
        const raw = valueFor(state, /when|date/) || (sentence.match(/\b(yesterday|today|last \w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i)?.[0] ?? '')
        answers[name] = answer('date', parseLooseDate(raw, today), raw || undefined)
        continue
      }
    }
    answers[name] = answer(field.type, value || null)
  }
  return { model: 'mock-clairic', answers, truncated: false, usage: { input_tokens: Math.ceil(state.length / 4), output_tokens: 0 } }
}
