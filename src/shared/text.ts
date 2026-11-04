/**
 * Matches PO box style addresses ("PO Box 12", "P.O. Box", "Post Office Box", "POB", "Box #5").
 * FedEx can't deliver to these, so the demo flags them on ship-to addresses.
 */
export const PO_BOX_REGEX =
  /\b(?:p[.\s-]{0,3}o[.\s-]{0,3}(?:box|bin|drawer)|p[.\s-]{0,3}o[.\s-]{0,3}b\b\.?|post\s+office\s+(?:box|bin|drawer))|^\s*box\s*#?\s*\d+/i

export function looksLikePoBox(value: string | null | undefined): boolean {
  return typeof value === 'string' && PO_BOX_REGEX.test(value.trim())
}

export function findPoBox(cells: string[]): string | null {
  for (const cell of cells) {
    const match = cell.match(/(?:p[\s.-]*o[\s.-]*box|post\s+office\s+box)\s*#?\s*\d+[^;\n]*/i)
    if (match) return match[0].trim()
  }
  return null
}

export function normalizeSerial(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = temp
    }
  }
  return prev[b.length]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Best-effort date reading for the mock models and the client's edit box. Returns YYYY-MM-DD or null. */
export function parseLooseDate(input: string | null | undefined, today: string): string | null {
  if (!input) return null
  const text = input.trim().toLowerCase()
  const base = new Date(`${today}T12:00:00Z`)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (text === 'today') return today
  if (text === 'yesterday') return iso(new Date(base.getTime() - 86400000))
  const last = text.match(/^last\s+(\w+)/)
  if (last) {
    const target = WEEKDAYS.indexOf(last[1])
    if (target >= 0) {
      let diff = (base.getUTCDay() - target + 7) % 7
      if (diff === 0) diff = 7
      return iso(new Date(base.getTime() - diff * 86400000))
    }
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (slash) {
    const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : base.getUTCFullYear()
    return iso(new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2]), 12)))
  }
  const named = text.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/)
  if (named && MONTHS.includes(named[1])) {
    const year = named[3] ? Number(named[3]) : base.getUTCFullYear()
    return iso(new Date(Date.UTC(year, MONTHS.indexOf(named[1]), Number(named[2]), 12)))
  }
  return null
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
