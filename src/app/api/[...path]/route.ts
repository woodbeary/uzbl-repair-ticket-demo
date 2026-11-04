import { getCloudflareContext } from '@opennextjs/cloudflare'
import { handleApi } from '@/server/api'
import type { Env } from '@/server/env'

export const dynamic = 'force-dynamic'

async function handler(request: Request) {
  const { env, ctx } = await getCloudflareContext({ async: true })
  return handleApi(request, env as unknown as Env, ctx)
}

export { handler as GET, handler as POST }
