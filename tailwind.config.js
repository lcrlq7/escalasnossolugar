/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), surface2: c('surface2'), border: c('border'),
        fg: c('fg'), muted: c('muted'),
        accent: c('accent'), accentfg: c('accent-fg'), accenttext: c('accent-text'),
        ok: c('ok'), warn: c('warn'), danger: c('danger'), info: c('info'),
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .18), 0 8px 24px -12px rgb(0 0 0 / .35)' },
    },
  },
  plugins: [],
}
