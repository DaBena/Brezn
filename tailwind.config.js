/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brezn: {
          bg: 'var(--brezn-bg)',
          panel: 'var(--brezn-panel)',
          button: 'var(--brezn-button)',
          buttonDisabled: 'var(--brezn-buttonDisabled)',
          border: 'var(--brezn-border)',
          text: 'var(--brezn-text)',
          muted: 'var(--brezn-muted)',
          overlay: 'var(--brezn-overlay)',
          link: 'var(--brezn-link)',
          error: 'var(--brezn-error)',
          errorSurface: 'var(--brezn-error-surface)',
          errorBorder: 'var(--brezn-error-border)',
          success: 'var(--brezn-success)',
          heart: 'var(--brezn-heart)',
        },
      },
    },
  },
  plugins: [],
}
