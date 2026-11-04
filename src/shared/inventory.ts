import type { Credits, InventoryDevice } from './types'

// Fictional district. Serials line up with samples/make_samples.py.
export const SCHOOL = {
  district: 'Pinecrest Valley USD (Demo)',
  school: 'Pinecrest High School',
  address: 'Pinecrest High School, 1450 Timberline Rd, Pinecrest, CO 80999',
  contact: { name: 'Dana Whitfield', email: 'dwhitfield@pinecrest-demo.k12.us' },
}

export const INITIAL_CREDITS: Credits = {
  touch: { total: 50, used: 41 },
  non_touch: { total: 59, used: 41 },
}

const PG = 'UZBL Protection Guarantee (36 mo)'
const OEM = 'Lenovo extended warranty (through 2029)'
const BF = 'Break-Fix credits'

function d(
  serial: string,
  assetTag: string,
  model: string,
  touch: InventoryDevice['touch'],
  coverage: InventoryDevice['coverage'],
  priorRepairs = 0,
  school = 'Pinecrest High School'
): InventoryDevice {
  const coverageLabel = coverage === 'warranty' ? PG : coverage === 'oem' ? OEM : coverage === 'break_fix' ? BF : 'No coverage'
  return { serial, assetTag, model, touch, school, coverage, coverageLabel, priorRepairs }
}

export const INVENTORY: InventoryDevice[] = [
  // Rows in pinecrest-repairs-oct.xlsx
  d('PF3XK2L9', 'PVH-10432', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF3XK2M1', 'PVH-10433', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF2ZQ8K4', 'PVH-10377', 'Lenovo 100e Chromebook Gen 4', 'non_touch', 'oem'),
  d('PF3XK2N1', 'PVH-10434', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('5CD2341KPQ', 'PVH-30021', 'HP Chromebook 11 G9 EE', 'non_touch', 'warranty'),
  d('PF3XK2P5', 'PVH-10440', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF3XK2Q2', 'PVH-10441', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF3XK2R8', 'PVH-10442', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty', 2),
  d('C02FK3XYQ6L4', 'PVH-40007', 'MacBook Air M2', 'non_touch', 'none'),
  d('PF3XK2S3', 'PVH-10443', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF4AB7T2', 'PVH-10450', 'Lenovo 500e Chromebook Gen 4', 'touch', 'warranty'),
  d('5CD2341KR2', 'PVH-30025', 'HP Chromebook 11 G9 EE', 'non_touch', 'break_fix'),
  d('PF3XK2T6', 'PVH-10444', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  // Rows in pinecrest-repairs.csv
  d('PF4AB7U9', 'PVH-10451', 'Lenovo 500e Chromebook Gen 4', 'touch', 'warranty', 0, 'Ridgeview Middle School'),
  d('PF4AB7V3', 'PVH-10452', 'Lenovo 500e Chromebook Gen 4', 'touch', 'warranty', 0, 'Ridgeview Middle School'),
  d('5CD2341KS7', 'PVH-30026', 'HP Chromebook 11 G9 EE', 'non_touch', 'break_fix', 0, 'Ridgeview Middle School'),
  d('PF2ZQ8L6', 'PVH-10378', 'Lenovo 100e Chromebook Gen 4', 'non_touch', 'oem', 0, 'Ridgeview Middle School'),
  d('PF4AB7W1', 'PVH-10453', 'Lenovo 500e Chromebook Gen 4', 'touch', 'warranty', 0, 'Ridgeview Middle School'),
  d('PF4AB7X8', 'PVH-10454', 'Lenovo 500e Chromebook Gen 4', 'touch', 'break_fix', 1, 'Ridgeview Middle School'),
  // Devices behind the seeded tickets
  d('PF3XJ9A4', 'PVH-10398', 'Lenovo 300e Chromebook Gen 4', 'touch', 'break_fix'),
  d('PF3XJ9B7', 'PVH-10399', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF3XJ9C2', 'PVH-10401', 'Lenovo 300e Chromebook Gen 4', 'touch', 'break_fix', 0, 'Alder Elementary'),
  d('PF3XJ9D5', 'PVH-10402', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty'),
  d('PF3XJ9E8', 'PVH-10403', 'Lenovo 300e Chromebook Gen 4', 'touch', 'warranty', 2),
  d('5CD2339JM4', 'PVH-30011', 'HP Chromebook 11 G9 EE', 'non_touch', 'break_fix', 0, 'Ridgeview Middle School'),
]

export function findDevice(serial: string): InventoryDevice | undefined {
  return INVENTORY.find((device) => device.serial === serial)
}
