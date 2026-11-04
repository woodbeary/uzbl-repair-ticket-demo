'use client'

import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import type { FileInfo } from '../lib/files'
import { cx } from '../lib/ui'
import { Action, Chip, Skeleton } from './Bits'

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** A spreadsheet as it was written: column letters, row numbers, every cell. Scrolls both ways. */
function Grid({ rows }: { rows: string[][] }) {
  const width = Math.max(1, ...rows.map((row) => row.length))
  return (
    <div className="no-scrollbar max-h-[40dvh] overflow-auto rounded-2xl border border-line" tabIndex={0} aria-label="File contents">
      <table className="border-separate border-spacing-0 font-mono text-[12px] leading-5">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 border-b border-r border-line bg-bg" />
            {Array.from({ length: width }, (_, column) => (
              <th key={column} className="sticky top-0 z-10 min-w-12 border-b border-r border-line bg-bg px-2.5 py-1 text-center font-medium text-fg-3">
                {columnName(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <th className="sticky left-0 z-10 border-b border-r border-line bg-bg px-2 py-1 text-right font-medium tabular-nums text-fg-3">{index + 1}</th>
              {Array.from({ length: width }, (_, column) => (
                <td key={column} title={row[column] || undefined} className="border-b border-r border-line px-2.5 py-1">
                  <div className="max-w-56 truncate">{row[column]}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The attached file exactly as it will be read: the spreadsheet, the picture or the text. */
export function FilePreview({ info, note, onSend }: { info: FileInfo | null; note?: string[]; onSend: () => void }) {
  const [tab, setTab] = useState(0)
  const sheet = info?.sheets?.[tab]
  return (
    <div className="space-y-3">
      {note && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Messy on purpose">
          {note.map((tag) => (
            <li key={tag}>
              <Chip>{tag}</Chip>
            </li>
          ))}
        </ul>
      )}
      {info?.sheets && info.sheets.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Sheets">
          {info.sheets.map((each, index) => (
            <button
              key={each.name}
              type="button"
              role="tab"
              aria-selected={index === tab}
              onClick={() => setTab(index)}
              className={cx('h-8 shrink-0 rounded-full px-3 text-[13px] font-medium', index === tab ? 'bg-fg text-bg' : 'bg-fill text-fg-2 hover:bg-fill-2')}
            >
              {each.name}
            </button>
          ))}
        </div>
      )}
      {!info ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Reading the file">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-7 w-full rounded-lg" />
          ))}
        </div>
      ) : sheet ? (
        <Grid rows={sheet.rows} />
      ) : info.image ? (
        <img src={info.image.url} width={info.image.width} height={info.image.height} alt="The attached picture" className="h-auto w-full rounded-2xl border border-line" />
      ) : info.text !== undefined ? (
        <pre className="no-scrollbar max-h-[40dvh] overflow-auto whitespace-pre-wrap rounded-2xl bg-fill p-4 font-mono text-[12px] leading-5">{info.text}</pre>
      ) : (
        <p className="rounded-2xl bg-fill px-4 py-6 text-center text-[14px] text-fg-2">No preview for this file</p>
      )}
      <p className="h-4 text-[12px] text-fg-3">{info?.summary}</p>
      <Action primary icon={ArrowUp} onClick={onSend}>
        Read this file
      </Action>
    </div>
  )
}
