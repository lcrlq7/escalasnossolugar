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
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(18px)' }, '100%': { opacity: 1, transform: 'none' } },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop': { '0%': { opacity: 0, transform: 'scale(.94) translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        'sheet': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        'float': { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(30px,-40px,0) scale(1.12)' } },
        'float2': { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(-40px,30px,0) scale(1.08)' } },
        'bob': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        'eq': { '0%,100%': { transform: 'scaleY(.25)' }, '50%': { transform: 'scaleY(1)' } },
        'shine': { '0%': { transform: 'translateX(-120%) skewX(-20deg)' }, '60%,100%': { transform: 'translateX(220%) skewX(-20deg)' } },
        'rise': { '0%': { opacity: 0, transform: 'translateY(0) scale(.6)' }, '15%': { opacity: .55 }, '100%': { opacity: 0, transform: 'translateY(-110vh) scale(1.1) rotate(25deg)' } },
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(.2,.8,.2,1) backwards',
        'fade-in': 'fade-in .35s ease-out backwards',
        'pop': 'pop .28s cubic-bezier(.2,.9,.3,1.2) backwards',
        'sheet': 'sheet .32s cubic-bezier(.2,.8,.2,1) backwards',
        'float': 'float 14s ease-in-out infinite',
        'float2': 'float2 18s ease-in-out infinite',
        'bob': 'bob 5s ease-in-out infinite',
        'eq': 'eq 1.1s ease-in-out infinite',
        'shine': 'shine 3.8s ease-in-out infinite',
        'rise': 'rise 14s linear infinite',
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .18), 0 8px 24px -12px rgb(0 0 0 / .35)' },
    },
  },
  plugins: [],
}
