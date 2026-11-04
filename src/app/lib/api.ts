import type { ClientTicket, Credits, DemoState, IntakeEvent, SubmissionRow } from '@/shared/types'

export interface StateResponse {
  school: DemoState['school']
  credits: Credits
  tickets: ClientTicket[]
  today: string
  aiMode: 'live' | 'mock'
}

export interface TicketResponse {
  ticket: ClientTicket
  credits: Credits
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

export const api = {
  state: () => request<StateResponse>('/api/state'),
  ticket: (id: string) => request<TicketResponse>(`/api/tickets/${id}`),
  advance: (id: string) => request<TicketResponse>(`/api/tickets/${id}/advance`, { method: 'POST', body: '{}' }),
  fixAddress: (id: string, address: string) => request<TicketResponse>(`/api/tickets/${id}/fix-address`, { method: 'POST', body: JSON.stringify({ address }) }),
  decide: (id: string, option: string) => request<TicketResponse>(`/api/tickets/${id}/decision`, { method: 'POST', body: JSON.stringify({ option }) }),
  submit: (rows: SubmissionRow[]) => request<{ created: ClientTicket[]; credits: Credits }>('/api/submissions', { method: 'POST', body: JSON.stringify({ rows }) }),
  reset: () => request<{ ok: true }>('/api/reset', { method: 'POST', body: '{}' }),
}

/** Streams the intake's NDJSON progress events as they arrive. */
export async function streamIntake(input: { file?: File; sample?: string; text?: string }, onEvent: (event: IntakeEvent) => void) {
  const init: RequestInit = { method: 'POST' }
  if (input.file) {
    const form = new FormData()
    form.append('file', input.file)
    init.body = form
  } else {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify({ sample: input.sample, text: input.text })
  }
  const response = await fetch('/api/intake', init)
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Upload failed (${response.status})`)
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) onEvent(JSON.parse(line) as IntakeEvent)
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as IntakeEvent)
}
