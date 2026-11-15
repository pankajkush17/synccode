import { cp } from 'node:fs/promises'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so they are bundled; npm deps stay external.
  noExternal: [/^@synccode\//],
  // @synccode/db locates its SQL migrations next to its own module; once bundled, that is dist/.
  onSuccess: async () => {
    await cp('../../packages/db/migrations', 'dist/migrations', { recursive: true })
  },
})
