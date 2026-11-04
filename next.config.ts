import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the workspace root to this folder.
  turbopack: { root: process.cwd() },
}

export default nextConfig

// `next dev` gets the bindings from the local config (KV, mock AI). The deployed Worker uses wrangler.jsonc.
if (process.env.NODE_ENV === 'development') initOpenNextCloudflareForDev({ configPath: './wrangler.dev.jsonc' })
