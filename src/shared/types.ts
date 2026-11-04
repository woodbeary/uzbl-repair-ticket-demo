export type Coverage = 'warranty' | 'oem' | 'break_fix' | 'none'
export type Program = 'warranty' | 'oem' | 'break_fix'
export type Route = Program | 'none' | 'not_repair'
export type TouchType = 'touch' | 'non_touch'

export interface InventoryDevice {
  serial: string
  assetTag: string
  model: string
  touch: TouchType
  school: string
  coverage: Coverage
  coverageLabel: string
  priorRepairs: number
}

export interface Credits {
  touch: { total: number; used: number }
  non_touch: { total: number; used: number }
}

export type ColumnKind =
  | 'serial_number'
  | 'asset_tag'
  | 'device_model'
  | 'touch_type'
  | 'student_name'
  | 'staff_contact'
  | 'incident_date'
  | 'what_happened'
  | 'location'
  | 'in_case'
  | 'ship_to_address'
  | 'notes'
  | 'ignore'

export interface ColumnMapping {
  index: number
  header: string
  kind: ColumnKind
  confidence: number
  dropped: boolean
}

export type FlagLevel = 'block' | 'warn' | 'info'

export interface Flag {
  code: string
  level: FlagLevel
  title: string
  detail?: string
}

export interface Extracted {
  value: string | null
  confidence: number
}

export interface RowFields {
  serial: Extracted
  assetTag: Extracted
  model: Extracted
  whatHappened: Extracted
  incidentDate: Extracted
  location: Extracted
  shipTo: Extracted
}

export type Damage =
  | 'screen'
  | 'keyboard'
  | 'liquid'
  | 'power'
  | 'battery'
  | 'hinge'
  | 'port'
  | 'wont_boot'
  | 'software'
  | 'lost_stolen'
  | 'other'
export type Cause = 'accidental' | 'defect' | 'intentional' | 'wear' | 'unknown'
export type InCase = 'yes' | 'no' | 'unknown'

export interface Decision<T extends string> {
  value: T
  confidence: number
}

export interface RowDecisions {
  damage: Decision<Damage>
  cause: Decision<Cause>
  inCase: Decision<InCase>
  /** Probability the report actually says what happened. */
  complete: number
}

/** What the pre-check rules need about one row; the client re-runs the rules when a cell is edited. */
export interface RowInput {
  rowNumber: number
  fields: RowFields
  decisions: RowDecisions
  /** Every cell of the row (student-name columns already removed), used for PO-box scanning. */
  cells: string[]
}

export interface RowVerdict {
  serial: string
  device: InventoryDevice | null
  suggestion: InventoryDevice | null
  route: Route
  routeLabel: string
  routeReason: string
  flags: Flag[]
  include: boolean
}

export interface IntakeRow extends RowInput, RowVerdict {
  raw: Record<string, string>
  aiSource: 'models' | 'backup-rules'
}

export interface StageTiming {
  id: 'read' | 'columns' | 'extract' | 'decide' | 'rules'
  label: string
  detail: string
  model: string | null
  ms: number
  calls: number
  inputTokens: number
  fallback?: boolean
}

export interface IntakeResult {
  fileName: string
  sheetName: string | null
  source: string
  columns: ColumnMapping[]
  rows: IntakeRow[]
  skippedRows: { rowNumber: number; reason: string }[]
  stages: StageTiming[]
  inventory: InventoryDevice[]
  credits: Credits
  today: string
}

export type IntakeEvent =
  | { type: 'stage'; id: StageTiming['id']; status: 'start' | 'done'; label: string; detail?: string; timing?: StageTiming }
  | { type: 'columns'; columns: ColumnMapping[]; sheetName: string | null; rowCount: number }
  | { type: 'row'; row: IntakeRow }
  | { type: 'result'; result: IntakeResult }
  | { type: 'error'; message: string }

export type EventSource = 'UZBL' | 'FedEx' | 'Repair center' | 'GetCover' | 'Lenovo' | 'School'

export interface TicketEvent {
  at: string
  source: EventSource
  title: string
  detail?: string
  /** Status key (see stages.ts) this event moved the ticket to, if any. */
  stage?: string
  kind?: 'normal' | 'problem' | 'resolved' | 'decision'
  /** Whether the submitter gets an email for this update. */
  notify?: boolean
}

export interface AttentionOption {
  id: string
  label: string
  detail?: string
  primary?: boolean
}

export interface Attention {
  kind: 'address' | 'denied' | 'ber'
  title: string
  /** A few words for the chip under the title. */
  tag?: string
  body: string
  reason?: string
  options?: AttentionOption[]
  suggestedAddress?: string
}

export interface ScriptStep {
  stage?: string
  source: EventSource
  title: string
  detail?: string
  kind?: TicketEvent['kind']
  notify?: boolean
  attention?: Attention
}

export interface Ticket {
  id: string
  program: Program
  device: { serial: string; model: string; assetTag: string; school: string; touch: TouchType }
  issue: { damage: Damage; whatHappened: string; incidentDate: string | null; location: string | null }
  submittedBy: { name: string; email: string }
  createdAt: string
  updatedAt: string
  stage: string
  closed: boolean
  shipTo: string
  claimNumber?: string
  trackingNumber?: string
  events: TicketEvent[]
  attention?: Attention
  script: ScriptStep[]
}

/** What the browser sees: the upcoming script stays on the server. */
export type ClientTicket = Omit<Ticket, 'script'> & { remaining: number }

export interface DemoState {
  school: { district: string; school: string; address: string; contact: { name: string; email: string } }
  credits: Credits
  tickets: Ticket[]
}

export interface SubmissionRow {
  rowNumber: number
  serial: string
  route: Program
  whatHappened: string
  incidentDate: string | null
  location: string | null
  shipTo: string | null
  damage: Damage
}
