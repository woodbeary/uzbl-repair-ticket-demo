// Thin wrappers over the Workers AI binding for the two System One-style models the demo uses:
// Clef (decisions: pick from options, with probabilities) and Clairic (typed extraction, with
// confidence and source spans), plus a vision model that copies the text out of screenshots.
// Calls go through AI Gateway when AI_GATEWAY_ID is set.
import type { Env } from '../env'
import { mockClairic, mockClef } from './mock'

export const CLEF_MODEL = '@cf/cloudflare/clef'
export const CLAIRIC_MODEL = '@cf/cloudflare/clairic'
// Clairic misreads the small print in a screenshot (serials come back garbled), so this model
// transcribes it first.
export const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'
const TRANSCRIBE_PROMPT =
  "Copy out all the text in this image exactly as written. Write any table or spreadsheet as a Markdown pipe table with its header row, leaving out the spreadsheet's own row numbers and column letters. Output only the transcription."

export interface Transcript {
  text: string
  inputTokens: number
  outputTokens: number
}

export type ClefQuestion =
  | { type: 'noul'; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
  | { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> }
  | { type: 'score'; instructions: unknown; criteria: unknown[] }

export type ClefAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number }

export interface ClefResponse {
  model: string
  answers: Record<string, ClefAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

export interface ClairicField {
  type: 'text' | 'number' | 'date' | 'list'
  instructions?: string
  items?: 'text' | 'number' | 'date'
  null_threshold?: number
}

export interface ClairicAnswer {
  type: string
  value: unknown
  confidence?: number
  p_null?: number
  span?: [number, number]
  spans?: [number, number][]
}

export interface ClairicRequest {
  state?: string
  fields: Record<string, ClairicField>
  images?: { content_type: string; base64: string }[]
  reference_date?: string
  options?: { return_state_text?: boolean }
}

export interface ClairicResponse {
  model: string
  answers: Record<string, ClairicAnswer>
  truncated: boolean
  state_text?: string
  usage: { input_tokens: number; output_tokens: number }
}

export interface Models {
  mode: 'live' | 'mock'
  clef(state: unknown, questions: Record<string, ClefQuestion>): Promise<ClefResponse>
  clairic(request: ClairicRequest): Promise<ClairicResponse>
  toMarkdown(name: string, bytes: Uint8Array, mime: string): Promise<string | null>
  transcribe(image: { content_type: string; base64: string }): Promise<Transcript | null>
}

interface AiRunner {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>
  toMarkdown(files: { name: string; blob: Blob }): Promise<{ format: string; data: string } | { format: string; data: string }[]>
}

export function createModels(env: Env): Models {
  if (env.DEMO_AI === 'mock' || !env.AI) {
    return {
      mode: 'mock',
      clef: async (state, questions) => mockClef(state, questions),
      clairic: async (request) => mockClairic(request),
      toMarkdown: async () => null,
      transcribe: async () => null,
    }
  }

  const ai = env.AI as unknown as AiRunner
  const gateway = env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined
  const run = async <T>(model: string, input: unknown): Promise<T> => {
    try {
      return (await ai.run(model, input, gateway)) as T
    } catch (error) {
      if (!gateway) throw error
      console.warn(`AI Gateway call to ${model} failed, retrying direct`, error)
      return (await ai.run(model, input)) as T
    }
  }

  return {
    mode: 'live',
    clef: (state, questions) => run<ClefResponse>(CLEF_MODEL, { model: 'clef', state, questions }),
    clairic: (request) => run<ClairicResponse>(CLAIRIC_MODEL, { model: 'clairic', ...request }),
    async toMarkdown(name, bytes, mime) {
      const result = await ai.toMarkdown({ name, blob: new Blob([new Uint8Array(bytes)], { type: mime }) })
      const first = Array.isArray(result) ? result[0] : result
      return first && first.format !== 'error' ? first.data : null
    },
    async transcribe(image) {
      const result = await run<{ response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }>(VISION_MODEL, {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TRANSCRIBE_PROMPT },
              { type: 'image_url', image_url: { url: `data:${image.content_type};base64,${image.base64}` } },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      })
      const text = typeof result.response === 'string' ? result.response.trim() : ''
      return text ? { text, inputTokens: result.usage?.prompt_tokens ?? 0, outputTokens: result.usage?.completion_tokens ?? 0 } : null
    },
  }
}

export function choiceOf(answer: ClefAnswer | undefined): { value: string; confidence: number } | null {
  if (!answer || answer.type !== 'choice') return null
  return { value: answer.choice, confidence: answer.confidence }
}

export function noulOf(answer: ClefAnswer | undefined): number | null {
  return answer && answer.type === 'noul' ? answer.noul : null
}
