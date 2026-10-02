import { defineConfig } from 'vitest/config'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Duas páginas com o mesmo app: index.html (prévia de produto) e convite.html (prévia
// de convite para o WhatsApp). No Pages, /convite é entregue por convite.html, e /c/:id
// e /c/:id/:convite pelas Pages Functions (functions/c/), que trocam a prévia pela do evento
// ou do convite; aqui o dev
// e o preview entregam convite.html nos dois, com a prévia genérica.
const inviteEntry: Connect.NextHandleFunction = (request, _response, next) => {
  if (request.url && /^\/convite\/?(\?|$)/.test(request.url)) request.url = request.url.replace(/^\/convite\/?/, '/convite.html')
  else if (request.url && /^\/c\/[^/?]+(\/[^/?]+)?\/?(\?|$)/.test(request.url)) request.url = request.url.replace(/^\/c\/[^/?]+(\/[^/?]+)?\/?/, '/convite.html')
  next()
}
const invitePage: Plugin = {
  name: 'chadbb-invite-page',
  configureServer: server => { server.middlewares.use(inviteEntry) },
  configurePreviewServer: server => { server.middlewares.use(inviteEntry) },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), invitePage],
  build: { rolldownOptions: { input: { main: 'index.html', convite: 'convite.html' }, output: { codeSplitting: { groups: [
    { name: 'supabase', test: /node_modules\/@supabase\// },
  ] } } } },
  // Restringe os prefixos expostos; valores configurados aqui ainda são públicos.
  envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
