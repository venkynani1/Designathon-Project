// Configures tooling for this application boundary and its automated validation.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/*.test.js',
      'src/**/*.test.jsx',
      'src/**/*.spec.js',
      'src/**/*.spec.jsx',
    ],
    exclude: [
      '../server/**',
      '../azure-functions/**',
      'node_modules/**',
      'dist/**',
    ],
  },
})
