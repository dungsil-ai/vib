import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import path from 'path'

const srcPath = path.resolve(process.cwd(), './src')

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/app/api/**',
        'src/lib/prisma.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': srcPath,
    },
  },
})
