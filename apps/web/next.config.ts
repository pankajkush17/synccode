import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@synccode/shared'],
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  outputFileTracingRoot: join(here, '../..'),
  poweredByHeader: false,
}

export default nextConfig
