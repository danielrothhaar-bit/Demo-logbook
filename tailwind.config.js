/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f6fb',
          100: '#e3e8f2',
          200: '#c5cee0',
          300: '#9aa7c2',
          400: '#6b7a99',
          500: '#475571',
          600: '#2f3a52',
          700: '#1f2738',
          800: '#141a27',
          900: '#0b0f17',
          950: '#070a11'
        },
        accent: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(245,158,11,0.55)' },
          '100%': { boxShadow: '0 0 0 28px rgba(245,158,11,0)' }
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      },
      animation: {
        pulseRing: 'pulseRing 1.4s cubic-bezier(0.4,0,0.6,1) infinite',
        fadeUp: 'fadeUp 180ms ease-out'
      }
    }
  },
  plugins: []
}
