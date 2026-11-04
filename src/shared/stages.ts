import type { Program } from './types'

export interface StageDef {
  /** The demo's status key for this step. */
  key: string
  label: string
  /** Which party reports this step (descriptive only). */
  source: string
  blurb: string
}

// The tracker's steps for each repair program. Keys are the demo's own status names.
export const STAGES: Record<Program, StageDef[]> = {
  break_fix: [
    { key: 'submitted', label: 'Submitted', source: 'UZBL', blurb: 'We have the request.' },
    { key: 'label_generated', label: 'Label ready', source: 'Shipping carrier', blurb: 'Print the FedEx label and box the device.' },
    { key: 'in_transit', label: 'On its way', source: 'Repair center', blurb: 'FedEx has it and is heading to the repair center.' },
    { key: 'received', label: 'At repair center', source: 'Repair center', blurb: 'Checked in at the FedEx repair depot.' },
    { key: 'in_triage', label: 'Diagnosing', source: 'Repair center', blurb: 'A technician is finding the fault.' },
    { key: 'in_repair', label: 'Repairing', source: 'Repair center', blurb: 'Parts are being replaced.' },
    { key: 'quality_assurance', label: 'Quality check', source: 'Repair center', blurb: 'Tested before it ships back.' },
    { key: 'returned', label: 'Shipped back', source: 'Repair center', blurb: 'On its way back to school.' },
    { key: 'delivered', label: 'Delivered', source: 'Shipping carrier', blurb: 'Back at school.' },
  ],
  warranty: [
    { key: 'request.review', label: 'Claim review', source: 'Warranty provider', blurb: 'GetCover is reviewing the claim.' },
    { key: 'label_sent', label: 'Label sent', source: 'Warranty provider', blurb: 'Claim approved. Ship the device with the prepaid label.' },
    { key: 'servicer_product_received', label: 'At repair center', source: 'Warranty provider', blurb: 'The repair partner has the device.' },
    { key: 'repair_in_process', label: 'Repairing', source: 'Warranty provider', blurb: 'The repair is underway.' },
    { key: 'repair_complete', label: 'Repair complete', source: 'Warranty provider', blurb: 'Fixed and packed.' },
    { key: 'returned', label: 'Shipped back', source: 'Shipping carrier', blurb: 'On its way back to school.' },
    { key: 'completed', label: 'Delivered', source: 'Warranty provider', blurb: 'Back at school and the claim is closed.' },
  ],
  oem: [
    { key: 'submitted', label: 'Submitted', source: 'UZBL', blurb: 'We matched it to the Lenovo warranty.' },
    { key: 'label_generated', label: 'Label ready', source: 'Shipping carrier', blurb: 'Print the FedEx label and box the device.' },
    { key: 'in_transit', label: 'On its way', source: 'Shipping carrier', blurb: 'Heading to the Lenovo depot.' },
    { key: 'received', label: 'At Lenovo depot', source: 'OEM depot (sample)', blurb: 'Checked in by Lenovo.' },
    { key: 'in_repair', label: 'Repairing', source: 'OEM depot (sample)', blurb: 'Lenovo is fixing it under warranty.' },
    { key: 'returned', label: 'Shipped back', source: 'Shipping carrier', blurb: 'On its way back to school.' },
    { key: 'delivered', label: 'Delivered', source: 'Shipping carrier', blurb: 'Back at school.' },
  ],
}

export const PROGRAM_LABELS: Record<Program, string> = {
  warranty: 'GetCover claim',
  oem: 'Lenovo warranty',
  break_fix: 'Break-Fix',
}

export function stageIndex(program: Program, stage: string): number {
  const index = STAGES[program].findIndex((def) => def.key === stage)
  return index < 0 ? 0 : index
}

export function stageLabel(program: Program, stage: string): string {
  if (stage === 'cancelled') return 'Claim denied'
  return STAGES[program].find((def) => def.key === stage)?.label ?? stage
}
