export interface Env {
  AI?: Ai
  ASSETS?: Fetcher
  DEMO_KV?: KVNamespace
  INTAKE_LIMITER?: RateLimit
  AI_GATEWAY_ID?: string
  /** "mock" runs the intake on the built-in heuristics instead of Workers AI (local dev, tests). */
  DEMO_AI?: string
}
