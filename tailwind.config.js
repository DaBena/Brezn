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
          panel2: 'var(--brezn-panel2)',
          button: 'var(--brezn-button)',
          buttonDisabled: 'var(--brezn-buttonDisabled)',
          border: 'var(--brezn-border)',
          text: 'var(--brezn-text)',
          muted: 'var(--brezn-muted)',
          gold: '#d6b25e',
          danger: '#e05a4f',
        },
      },
      boxShadow: {
        soft: '0 8px 24px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
}

