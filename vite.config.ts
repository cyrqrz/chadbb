import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rolldownOptions: { output: { codeSplitting: { groups: [
    { name: 'supabase', test: /node_modules\/@supabase\// },
  ] } } } },
  // Restringe os prefixos expostos; valores configurados aqui ainda são públicos.
  envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
