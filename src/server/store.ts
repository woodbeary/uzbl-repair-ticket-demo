import type { ClientTicket, DemoState, Ticket } from '../shared/types'
import type { Env } from './env'
import { seedState } from './seed'

const TTL_SECONDS = 7 * 24 * 3600
const memory = new Map<string, string>()

// One KV entry per visitor sandbox, so one school's demo uploads never show up for another.
const key = (sessionId: string) => `session:${sessionId}`

export async function loadState(env: Env, sessionId: string): Promise<DemoState> {
  const raw = env.DEMO_KV ? await env.DEMO_KV.get(key(sessionId)) : memory.get(key(sessionId))
  return raw ? (JSON.parse(raw) as DemoState) : seedState()
}

export async function saveState(env: Env, sessionId: string, state: DemoState): Promise<void> {
  const value = JSON.stringify(state)
  if (env.DEMO_KV) await env.DEMO_KV.put(key(sessionId), value, { expirationTtl: TTL_SECONDS })
  else memory.set(key(sessionId), value)
}

export function toClient(ticket: Ticket): ClientTicket {
  const { script, ...rest } = ticket
  return { ...rest, remaining: script.length }
}
