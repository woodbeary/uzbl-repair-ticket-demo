import { describe, expect, it } from 'vitest'
import { fileSize, kindOf, trimGrid } from '../src/app/lib/files'
import { findTickets, looksLikeId, normalize } from '../src/app/lib/find'
import { seedState } from '../src/server/seed'
import { toClient } from '../src/server/store'

const tickets = seedState(new Date('2026-10-24T18:00:00Z')).tickets.map(toClient)

describe('quick find', () => {
  it('ignores case, dashes and spaces', () => {
    expect(normalize(' uz-24 795 ')).toBe('UZ24795')
  })

  it('finds a repair from part of its serial and marks the matched characters', () => {
    const [match] = findTickets(tickets, 'j9c2')
    expect(match.ticket.id).toBe('UZ-24795')
    expect(match.field).toBe('serial')
    expect(match.value.slice(...match.range)).toBe('J9C2')
  })

  it('treats an exact ticket number as exact, however it is typed', () => {
    const matches = findTickets(tickets, 'uz 24793')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ field: 'ticket', exact: true })
  })

  it('finds repairs by asset tag, FedEx tracking or claim number', () => {
    expect(findTickets(tickets, 'pvh10401')[0]).toMatchObject({ field: 'asset', exact: true })
    const tracking = findTickets(tickets, '7946 1205')
    expect(tracking.map((match) => match.ticket.id)).toEqual(['UZ-24791'])
    expect(tracking[0].value.slice(...tracking[0].range)).toBe('79461205')
    expect(findTickets(tickets, 'GC-24797')[0]).toMatchObject({ field: 'claim' })
  })

  it('prefers a serial over a ticket or claim that also contains the text', () => {
    // "J9D5" is in serial PF3XJ9D5 and in claim GC-24793-J9D5.
    const [match] = findTickets(tickets, 'J9D5')
    expect(match).toMatchObject({ field: 'serial' })
    expect(match.ticket.id).toBe('UZ-24793')
  })

  it('waits for two characters and tells identifiers from sentences', () => {
    expect(findTickets(tickets, 'p')).toEqual([])
    expect(looksLikeId('PF3XJ9C2')).toBe(true)
    expect(looksLikeId('7946 1205 8831')).toBe(true)
    expect(looksLikeId('uz 24793')).toBe(true)
    expect(looksLikeId('PF3XK2L9 screen cracked')).toBe(false)
    expect(looksLikeId('two screens cracked in room 12 this morning')).toBe(false)
    expect(looksLikeId('screen cracked')).toBe(false)
  })
})

describe('attachments', () => {
  it('knows a file by its name or type', () => {
    expect(kindOf('Oct repairs.XLSX')).toBe('excel')
    expect(kindOf('export', 'text/csv')).toBe('csv')
    expect(kindOf('IMG_0042.HEIC')).toBe('image')
    expect(kindOf('scan.pdf')).toBe('document')
  })

  it('trims empty rows and columns off a sheet, keeping every cell in between', () => {
    expect(trimGrid([['a', '', ''], ['', 'b', ''], ['', '', ''], []])).toEqual([
      ['a', ''],
      ['', 'b'],
    ])
  })

  it('writes sizes the way a person would', () => {
    expect(fileSize(7301)).toBe('7 KB')
    expect(fileSize(2_500_000)).toBe('2.4 MB')
  })
})
