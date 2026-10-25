import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  // Keep mappings (so stack traces resolve to file:line) but drop the
  // embedded TS source. Otherwise the .map files ship a full copy of
  // src/index.ts inside the npm tarball.
  esbuildOptions(options) {
    options.sourcesContent = false
  },
})
