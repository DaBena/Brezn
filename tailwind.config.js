/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brezn: {
          bg: '#161618',
          panel: '#121216',
          panel2: '#17171d',
          button: '#4a4a52',
          buttonDisabled: '#2a2a30',
          border: '#242430',
          text: '#f4f1ea',
          muted: '#b8b0a3',
          gold: '#d6b25e',
          danger: '#e05a4f',
        },
      },
      boxShadow: {
        soft: '0 8px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}

