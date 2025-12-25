import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
function normalizeBasePath(input?: string) {
  if (!input || input === '/') return '/'
  const withLeadingSlash = input.startsWith('/') ? input : `/${input}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

const base = normalizeBasePath(process.env.BASE_PATH)

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // We register manually in-app to show an update toast.
      registerType: 'prompt',
      injectRegister: null,
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/brezn.svg', 'offline.html'],
      manifest: {
        name: 'Brezn',
        short_name: 'Brezn',
        description: 'Nostr-Client für lokale Posts.',
        start_url: base,
        scope: base,
        display: 'standalone',
        // pr0gramm "richtiges grau"
        background_color: '#161618',
        theme_color: '#161618',
        icons: [
          {
            src: `${base}icons/brezn.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,woff2}'],
        navigateFallback: `${base}offline.html`,
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
})
