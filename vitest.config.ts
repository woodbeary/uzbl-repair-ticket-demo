import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The same @/ alias as tsconfig, so the browser-side libs can be tested too.
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
