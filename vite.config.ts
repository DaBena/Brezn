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
      includeAssets: ['icons/brezn.svg', 'icons/brezn-192.png', 'icons/brezn-512.png', 'offline.html'],
      manifest: {
        name: 'Brezn',
        short_name: 'Brezn',
        description: 'Nostr-Client für lokale Posts.',
        start_url: `${base}?utm_source=pwa`,
        scope: base,
        display: 'standalone',
        background_color: '#161618',
        theme_color: '#161618',
        lang: 'de',
        dir: 'ltr',
        icons: [
          {
            src: `${base}icons/brezn.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: `${base}icons/brezn-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}icons/brezn-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}icons/brezn-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: `${base}icons/brezn-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        orientation: 'portrait',
        categories: ['social', 'utilities'],
        // Prefer maskable icons, but fallback to regular icons if not available
        prefer_related_applications: false,
      },
      workbox: {
        // Only use globPatterns in production to avoid dev-dist warnings
        ...(process.env.NODE_ENV === 'production' && {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,woff2}'],
        }),
        // Only use navigateFallback in production - in dev mode, let Vite handle routing
        ...(process.env.NODE_ENV === 'production' && {
          navigateFallback: `${base}offline.html`,
          navigateFallbackDenylist: [/^\/api\//],
        }),
        // Runtime caching for images from external media servers
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|avif)$/i,
            handler: 'StaleWhileRevalidate', // Better for iOS - serves cache immediately, updates in background
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 42, // Max 42 images
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable Workbox in dev mode to avoid warnings about Vite dev resources
        type: 'module', // Use module type if enabled
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
})
