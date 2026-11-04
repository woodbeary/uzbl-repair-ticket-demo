// Renders public/samples/repair-list-screenshot.png: what a teacher's screenshot of a sheet looks like.
import { chromium } from '@playwright/test'

const rows = [
  ['PVH-10451', 'PF4AB7U9', 'screen cracked, dropped in hallway (was in case)', '10/20', 'Rm 12'],
  ['PVH-30026', '5CD2341KS7', "trackpad won't click", '10/21', 'Rm 7'],
  ['PVH-10378', 'PF2ZQ8L6', 'stopped charging, no damage', '10/22', 'Rm 7'],
  ['PVH-10452', 'PF4AB7V3', 'water spilled on it, wont turn on', '10/22', 'Library'],
]
const cell = 'border:1px solid #e2e3e3;padding:6px 10px;font:13px Arial,sans-serif;color:#202124;white-space:nowrap'
const head = `${cell};background:#f8f9fa;color:#5f6368;text-align:center`
const html = `<!doctype html><body style="margin:0;background:#fff">
<div style="padding:10px 12px;font:15px Arial;color:#202124;border-bottom:1px solid #e2e3e3">Ridgeview repairs - week of 10/20 <span style="color:#5f6368;font-size:12px">&nbsp;Last edit was 2 minutes ago</span></div>
<table style="border-collapse:collapse;margin:0">
<tr><td style="${head}"></td>${['A', 'B', 'C', 'D', 'E'].map((c) => `<td style="${head}">${c}</td>`).join('')}</tr>
<tr><td style="${head}">1</td>${['Asset', 'Serial', 'Issue', 'Date', 'Room'].map((h) => `<td style="${cell};font-weight:bold">${h}</td>`).join('')}</tr>
${rows.map((r, i) => `<tr><td style="${head}">${i + 2}</td>${r.map((v) => `<td style="${cell}">${v}</td>`).join('')}</tr>`).join('')}
</table></body>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 760, height: 260 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.screenshot({ path: new URL('../public/samples/repair-list-screenshot.png', import.meta.url).pathname, fullPage: true })
await browser.close()
console.log('wrote public/samples/repair-list-screenshot.png')
