/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./frontend/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          '950': '#030712',
          '900': '#0f172a',
          '850': '#1a202f',
          '800': '#1e293b',
        },
        primary: {
          '50': '#f0f9ff',
          '400': '#60a5fa',
          '500': '#3b82f6',
          '600': '#2563eb',
          '700': '#1d4ed8',
          '900': '#1e3a8a',
        },
        success: {
          '400': '#4ade80',
          '500': '#22c55e',
          '600': '#16a34a',
        },
        warning: {
          '400': '#facc15',
          '500': '#eab308',
          '600': '#ca8a04',
        },
        error: {
          '400': '#f87171',
          '500': '#ef4444',
          '600': '#dc2626',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        }
      }
    },
  },
  plugins: [],
}
