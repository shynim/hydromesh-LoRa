/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Black & Ash palette — true black layout, deep ash-gray cards
        ash: {
          950: '#000000', // true black — main layout background
          900: '#0A0A0A', // near-black
          850: '#141414',
          800: '#1A1A1A', // deep ash-gray — component cards / sidebars
          750: '#222222',
          700: '#262626', // alt deep ash
          600: '#333333',
          500: '#3D3D3D',
          400: '#525252',
          300: '#737373',
          200: '#A3A3A3', // muted gray — secondary labels
          100: '#D4D4D4',
          50: '#FFFFFF', // crisp white — primary text / headers
        },
        river: {
          50: '#eef9ff',
          100: '#d9f0ff',
          200: '#bce5ff',
          300: '#8ed5ff',
          400: '#59bcff',
          500: '#2f9eff',
          600: '#1680f5',
          700: '#0d66d8',
          800: '#1053ae',
          900: '#134789',
        },
        alert: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        ok: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
      },
      boxShadow: {
        glow: '0 0 20px -2px rgba(47, 158, 255, 0.45)',
        'glow-green': '0 0 16px -1px rgba(34, 197, 94, 0.7)',
        'glow-yellow': '0 0 14px -1px rgba(245, 158, 11, 0.7)',
        'glow-red': '0 0 14px -1px rgba(239, 68, 68, 0.7)',
        'glow-grey': '0 0 10px -2px rgba(115, 115, 115, 0.5)',
        panel: '0 8px 30px -12px rgba(0,0,0,0.8)',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.7)', opacity: '0.9' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        dashFlow: {
          to: { strokeDashoffset: '-24' },
        },
        slideIn: {
          from: { transform: 'translateY(6px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        blink: 'blink 1.4s ease-in-out infinite',
        pulseRing: 'pulseRing 2s ease-out infinite',
        slideIn: 'slideIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
