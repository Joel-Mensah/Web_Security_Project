/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // ThemeProvider injects .dark / .light on <html>
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050c1a',
          900: '#0F172A',
          800: '#1e293b',
          700: '#263347',
        },
        slate: {
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
        },
        emerald: {
          500: '#10B981',
          400: '#34d399',
          300: '#6ee7b7',
        },
        // CSS-variable backed theme tokens (HSL/RGB with opacity support)
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--text-1) / <alpha-value>)',
          soft: 'rgb(var(--text-2) / <alpha-value>)',
          faint: 'rgb(var(--text-3) / <alpha-value>)',
        },
        brand: {
          600: 'rgb(var(--accent-1) / <alpha-value>)',
          500: 'rgb(var(--accent-2) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'shake': 'shake 0.4s ease-in-out',
        'spin-slow': 'spin 30s linear infinite',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.455, 0.030, 0.515, 0.955) infinite',
        'countdown': 'countdown 30s linear forwards',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        shake:     { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-8px)' }, '40%,80%': { transform: 'translateX(8px)' } },
        pulseRing: { '0%': { transform: 'scale(.8)', opacity: '1' }, '80%,100%': { transform: 'scale(2)', opacity: '0' } },
        countdown: { from: { strokeDashoffset: '0' }, to: { strokeDashoffset: '126' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
