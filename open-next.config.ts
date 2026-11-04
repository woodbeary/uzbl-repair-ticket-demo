import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Every page is dynamic (per-visitor sandbox), so no incremental cache is configured.
export default defineCloudflareConfig()
