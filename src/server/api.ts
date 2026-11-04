// The demo's JSON API, mounted by the Next.js catch-all route at src/app/api/[...path]/route.ts.
import { isProgram } from '../shared/rules'
import type { IntakeEvent, SubmissionRow } from '../shared/types'
import { createModels } from './ai/models'
import type { Env } from './env'
import { runIntake, type IntakeFile } from './intake/pipeline'
import { seedState } from './seed'
import { loadState, saveState, toClient } from './store'
import { TrackerError, advance, createTickets, decide, fixAddress } from './tracker'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const COOKIE = 'uzbl_demo'

export const SAMPLE_FILES: Record<string, string> = {
  'pinecrest-repairs-oct.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pinecrest-repairs.csv': 'text/csv',
  'repair-list-screenshot.png': 'image/png',
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers } })
}

function error(message: string, status = 400): Response {
  return json({ error: message }, { status })
}

function sessionFrom(request: Request): { id: string; isNew: boolean } {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9-]{36})`))
  return match ? { id: match[1], isNew: false } : { id: crypto.randomUUID(), isNew: true }
}

/** Today's date where the (fictional) district is, so "yesterday" and "last Tuesday" resolve sensibly. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date())
}

/** Samples ship as static files in public/samples, so the one-click buttons read them back through the assets binding. */
async function loadSample(env: Env, request: Request, name: string): Promise<IntakeFile> {
  const mime = SAMPLE_FILES[name]
  if (!mime || !env.ASSETS) throw new TrackerError('Unknown sample.')
  const response = await env.ASSETS.fetch(new URL(`/samples/${name}`, request.url))
  if (!response.ok) throw new TrackerError('Sample file missing.', 500)
  return { name, bytes: new Uint8Array(await response.arrayBuffer()), mime }
}

async function readUpload(env: Env, request: Request): Promise<IntakeFile> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = (await request.json()) as { sample?: string; text?: string }
    if (body.sample) return loadSample(env, request, body.sample)
    if (body.text) return { name: 'pasted.txt', bytes: new TextEncoder().encode(body.text.slice(0, 20000)), mime: 'text/plain' }
    throw new TrackerError('Pick a sample or upload a file.')
  }
  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new TrackerError('No file in the upload.')
  if (file.size > MAX_UPLOAD_BYTES) throw new TrackerError('That file is over 4 MB. Try a smaller export.', 413)
  return { name: file.name || 'upload', bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type }
}

async function route(request: Request, env: Env, ctx: ExecutionContext, sessionId: string): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method

  if (method === 'GET' && pathname === '/api/state') {
    const state = await loadState(env, sessionId)
    return json({ school: state.school, credits: state.credits, tickets: state.tickets.map(toClient), today: today(), aiMode: createModels(env).mode })
  }

  if (method === 'POST' && pathname === '/api/reset') {
    await saveState(env, sessionId, seedState())
    return json({ ok: true })
  }

  if (method === 'POST' && pathname === '/api/intake') {
    const ip = request.headers.get('cf-connecting-ip') ?? 'local'
    if (env.INTAKE_LIMITER) {
      const { success } = await env.INTAKE_LIMITER.limit({ key: ip })
      if (!success) return error('Slow down a little: the demo allows 10 uploads a minute.', 429)
    }
    const file = await readUpload(env, request)
    const state = await loadState(env, sessionId)
    const models = createModels(env)
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    // A closed tab rejects the write; the intake just finishes unseen.
    const emit = (event: IntakeEvent) => void writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {})
    ctx.waitUntil(
      (async () => {
        try {
          const result = await runIntake(models, file, emit, today(), state.credits)
          emit({ type: 'result', result })
        } catch (err) {
          console.error('Intake failed', err)
          emit({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong reading that file.' })
        } finally {
          await writer.close().catch(() => {})
        }
      })()
    )
    return new Response(readable, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } })
  }

  if (method === 'POST' && pathname === '/api/submissions') {
    const body = (await request.json()) as { rows?: SubmissionRow[] }
    const rows = (body.rows ?? []).filter((row) => isProgram(row.route))
    if (!rows.length) return error('Nothing to submit.')
    const state = await loadState(env, sessionId)
    const created = createTickets(state, rows)
    await saveState(env, sessionId, state)
    return json({ created: created.map(toClient), credits: state.credits })
  }

  const ticketRoute = pathname.match(/^\/api\/tickets\/(UZ-\d+)(?:\/(advance|fix-address|decision))?$/)
  if (ticketRoute) {
    const state = await loadState(env, sessionId)
    const ticket = state.tickets.find((candidate) => candidate.id === ticketRoute[1])
    if (!ticket) return error('That repair is not in this demo sandbox.', 404)
    if (method === 'GET' && !ticketRoute[2]) return json({ ticket: toClient(ticket), credits: state.credits })
    if (method === 'POST' && ticketRoute[2]) {
      const body = ticketRoute[2] === 'advance' ? {} : ((await request.json()) as { address?: string; option?: string })
      if (ticketRoute[2] === 'advance') advance(ticket)
      else if (ticketRoute[2] === 'fix-address') fixAddress(ticket, body.address ?? '')
      else decide(state, ticket, body.option ?? '')
      await saveState(env, sessionId, state)
      return json({ ticket: toClient(ticket), credits: state.credits })
    }
  }

  return error('Not found', 404)
}

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const session = sessionFrom(request)
  let response: Response
  try {
    response = await route(request, env, ctx, session.id)
  } catch (err) {
    if (err instanceof TrackerError) response = error(err.message, err.status)
    else {
      console.error(err)
      response = error('Something went wrong.', 500)
    }
  }
  response.headers.set('x-robots-tag', 'noindex, nofollow')
  if (session.isNew) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
    response.headers.append('set-cookie', `${COOKIE}=${session.id}; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly${secure}`)
  }
  return response
}
