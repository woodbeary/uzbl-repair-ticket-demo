import { expect, test } from '@playwright/test'

const FINDER = 'Find a repair or describe one'

// The core flows run with the first-visit tips off; the tips have their own tests.

test.describe('demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('uzbl-demo-tips', JSON.stringify({ seen: [], off: true })))
    await page.goto('/')
    await page.request.post('/api/reset', { data: {} })
    await page.goto('/')
  })

  test('one screen: the finder and the live status', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Find a repair, or start one' })).toBeVisible()
    await expect(page.getByLabel(FINDER)).toBeVisible()
    await expect(page.getByRole('button', { name: /5 in repair, 3 need you/ })).toBeVisible()
    // Nothing on the page scrolls.
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true)
  })

  test('a sample loads into the composer and previews as written before it is sent', async ({ page }) => {
    await page.getByRole('button', { name: 'CSV' }).click()
    const chip = page.getByRole('button', { name: 'Preview pinecrest-repairs.csv' })
    await expect(chip).toContainText('CSV · 7 rows')
    await chip.click()
    const sheet = page.getByRole('dialog', { name: 'pinecrest-repairs.csv' })
    await expect(sheet).toContainText('PO box in notes')
    await expect(sheet.getByRole('cell', { name: 'PF4AB7X8' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Read this file' }).click()
    await expect(page.getByRole('heading', { name: 'Can’t ship to a PO box' })).toBeVisible({ timeout: 60_000 })
  })

  test('messy spreadsheet: one question at a time, then submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Excel' }).click()
    await expect(page.getByRole('button', { name: 'Preview pinecrest-repairs-oct.xlsx' })).toContainText('Excel · 21 rows · 2 sheets')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByRole('heading', { name: 'Can’t ship to a PO box' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Jaden M.')).toHaveCount(0)

    // The PO box, struck through, over the school's street address, which it suggests.
    await expect(page.getByText('PO Box 1187', { exact: true })).toBeVisible()
    await expect(page.getByText('1450 Timberline Rd', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Use this address' }).click()
    // The typed serial, struck through, over the closest real one, which it suggests.
    await expect(page.getByRole('heading', { name: 'Serial not found' })).toBeVisible()
    await expect(page.getByText('PF3XK2N1', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Use this serial' }).click()

    await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible()
    await page.getByLabel('What happened').fill('Dropped off a desk, screen cracked')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('heading', { name: /likely denied/i })).toBeVisible()
    await page.getByRole('button', { name: 'Use Break-Fix' }).click()

    await expect(page.getByRole('heading', { name: 'No coverage' })).toBeVisible()
    await page.getByRole('button', { name: 'Use a credit' }).click()

    const submit = page.getByRole('button', { name: /^Submit \d+$/ })
    await expect(submit).toBeVisible()
    const count = Number((await submit.textContent())?.match(/\d+/)?.[0])
    expect(count).toBe(12)
    await submit.click()

    await expect(page.getByRole('status')).toContainText(`${count} submitted`)
    await expect(page.getByText('1 / 18')).toBeVisible()
    await expect(page.locator('article').first()).toContainText(/Claim review|Label ready|Submitted/)
    await page.locator('article').first().getByRole('button', { name: 'Next update' }).click()
    await expect(page.locator('article').first()).toContainText(/Label sent|On its way/)
  })

  test('quick find: part of a serial pulls the repair up, identifiers first', async ({ page }) => {
    await page.getByLabel(FINDER).fill('j9c2')
    await page.getByRole('button', { name: 'Open UZ-24795, serial PF3XJ9C2' }).click()
    const card = page.getByRole('article', { name: 'Repair UZ-24795' })
    await expect(card.getByRole('heading', { name: 'PF3XJ9C2' })).toBeVisible()
    await expect(card).toContainText('PVH-10401')
    await expect(card).toContainText('Can’t ship to a PO box')
  })

  test('quick find: an exact ticket or tracking number opens on Enter', async ({ page }) => {
    const finder = page.getByLabel(FINDER)
    await finder.fill('uz-24793')
    await finder.press('Enter')
    await expect(page.getByRole('article', { name: 'Repair UZ-24793' })).toBeVisible()

    await page.getByRole('button', { name: 'Home' }).click()
    await page.getByLabel(FINDER).fill('7946 1205 8831')
    await page.getByLabel(FINDER).press('Enter')
    await expect(page.getByRole('article', { name: 'Repair UZ-24791' })).toContainText('794612058831')

    await page.getByRole('button', { name: 'Home' }).click()
    await page.getByLabel(FINDER).fill('PF9ZZ99')
    await expect(page.getByText('No repair matches “PF9ZZ99”')).toBeVisible()
  })

  test('email link opens the tracker on the PO-box repair, which resumes after an address', async ({ page }) => {
    await page.goto('/track/UZ-24795')
    const card = page.getByRole('article', { name: 'Repair UZ-24795' })
    await expect(card).toContainText('Can’t ship to a PO box')
    await expect(card).toContainText('PO Box 1187')
    await expect(card).toContainText('220 Aspen Way')
    await card.getByRole('button', { name: 'Use this address' }).click()
    await expect(card).toContainText('Label ready')
    await card.getByRole('button', { name: 'Next update' }).click()
    await expect(card).toContainText('Picked up')
  })

  test('denied claim shows the reason and converts to a Break-Fix credit', async ({ page }) => {
    await page.goto('/track/UZ-24793')
    const card = page.getByRole('article', { name: 'Repair UZ-24793' })
    await expect(card).toContainText('No case at time of damage')
    await card.getByRole('button', { name: 'Use a credit' }).click()
    await expect(card).toContainText('Label ready')
  })

  test('email preview goes only to the submitter', async ({ page }) => {
    await page.goto('/track/UZ-24797')
    await page.getByRole('article', { name: 'Repair UZ-24797' }).getByRole('button', { name: 'Email' }).click()
    await expect(page.getByRole('dialog')).toContainText('Only the submitter')
    await expect(page.getByRole('dialog')).toContainText('Fix it in one tap')
  })

  test('nothing moves while data streams in or loads', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) w.__cls += entry.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    const cls = () => page.evaluate(() => (window as unknown as { __cls: number }).__cls)

    await page.goto('/')
    await page.getByRole('button', { name: 'Excel' }).click()
    await expect(page.getByRole('button', { name: 'Preview pinecrest-repairs-oct.xlsx' })).toContainText('Excel')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByRole('heading', { name: 'Can’t ship to a PO box' })).toBeVisible({ timeout: 60_000 })
    expect(await cls()).toBeLessThan(0.02)

    // A cold tracker link paints a skeleton with the card's exact shape first.
    await page.goto('/track/UZ-24797')
    await expect(page.getByRole('article', { name: 'Repair UZ-24797' })).toBeVisible()
    expect(await cls()).toBeLessThan(0.02)
  })
})

test('first-visit tips: one at a time, the page stays usable, and Skip is for good', async ({ page }) => {
  await page.goto('/')
  const first = page.getByRole('dialog', { name: 'Find any repair' })
  await expect(first).toBeVisible()
  await first.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('dialog', { name: 'Or start new ones' })).toBeVisible()

  // Clicks still reach the page under a tip, and the next tip follows what was done.
  await page.getByRole('button', { name: 'Excel' }).click()
  await expect(page.getByRole('dialog', { name: /See what.s inside/ })).toBeVisible()
  await page.getByRole('button', { name: 'Skip tips' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.reload()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a tip on the tracker opens fully on screen, beside or under what it explains', async ({ page }) => {
  await page.goto('/track/UZ-24795')
  const tip = page.getByRole('dialog', { name: 'Every repair at a glance' })
  await expect(tip).toBeVisible()
  const box = (await tip.boundingBox())!
  const view = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(view.height)
  expect(box.x + box.width).toBeLessThanOrEqual(view.width)
  await tip.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
