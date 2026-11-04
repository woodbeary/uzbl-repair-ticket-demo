import type { Cause, ColumnKind, Damage, InCase } from './types'

export const COLUMN_KINDS: Record<ColumnKind, { label: string; describe: string }> = {
  serial_number: { label: 'Serial number', describe: 'Device serial numbers (the S/N on the sticker), for example PF3XK2L9' },
  asset_tag: { label: 'Asset tag', describe: "The district's own asset tag or inventory number" },
  device_model: { label: 'Device model', describe: 'Device make or model, such as Lenovo 300e, HP 11 G9 or MacBook Air' },
  touch_type: { label: 'Touch / non-touch', describe: 'Whether the device has a touch screen' },
  student_name: { label: 'Student name', describe: 'Names of students' },
  staff_contact: { label: 'Staff contact', describe: 'Names or emails of teachers or staff' },
  incident_date: { label: 'Date', describe: 'When it happened or was reported' },
  what_happened: { label: 'What happened', describe: 'A description of the damage or the problem' },
  location: { label: 'Where', describe: 'Where it happened: a room, the bus, home' },
  in_case: { label: 'In case?', describe: 'Whether the device was in its protective case' },
  ship_to_address: { label: 'Ship-to address', describe: 'A shipping or return address' },
  notes: { label: 'Notes', describe: 'Other notes or comments' },
  ignore: { label: 'Not used', describe: 'Empty, totals, or nothing useful for a repair' },
}

export const DAMAGE: Record<Damage, { label: string; describe: string }> = {
  screen: { label: 'Screen', describe: 'Cracked, broken, black or flickering screen' },
  keyboard: { label: 'Keyboard / trackpad', describe: 'Keys, keyboard or trackpad' },
  liquid: { label: 'Liquid', describe: 'A spill or water damage' },
  power: { label: 'Power / charging', describe: "Won't charge or has power problems" },
  battery: { label: 'Battery', describe: 'Battery swollen or not holding a charge' },
  hinge: { label: 'Hinge / housing', describe: 'Hinge, lid, bezel or housing broken' },
  port: { label: 'Port', describe: 'Charging port or another port' },
  wont_boot: { label: "Won't turn on", describe: "Won't turn on or boot, with no visible damage" },
  software: { label: 'Software', describe: 'A software, login or operating system problem' },
  lost_stolen: { label: 'Lost / stolen', describe: 'The device is lost or was stolen' },
  other: { label: 'Other', describe: 'Something else' },
}

export const CAUSE: Record<Cause, { label: string; describe: string }> = {
  accidental: { label: 'Accident', describe: 'An accident: dropped, fell, knocked over, spilled on, crushed' },
  defect: { label: 'Defect', describe: 'Stopped working on its own with no accident (a manufacturer defect)' },
  intentional: { label: 'Intentional', describe: 'Damaged on purpose: thrown, vandalized, misused' },
  wear: { label: 'Wear and tear', describe: 'Normal wear and tear from use' },
  unknown: { label: 'Unclear', describe: 'The report does not say how it happened' },
}

export const IN_CASE: Record<InCase, { label: string; describe: string }> = {
  yes: { label: 'In case', describe: 'Yes, it was in its protective case' },
  no: { label: 'No case', describe: 'No, the case was off or it had no case' },
  unknown: { label: 'Not stated', describe: 'The report does not say' },
}
