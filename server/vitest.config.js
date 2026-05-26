// Configures tooling for this application boundary and its automated validation.
// Provides core API infrastructure for vitest.config concerns.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
})
