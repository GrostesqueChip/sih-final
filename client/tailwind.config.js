/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        hindi: ['"Noto Sans Devanagari"', '"Noto Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderWidth: {
        '3': '3px',
      },
      colors: {
        primary: {
          50: '#eef4fb',
          100: '#d9e6f5',
          200: '#b5cdeb',
          300: '#86acdb',
          400: '#4f82c4',
          500: '#2a64ad',
          600: '#1c4f96',
          700: '#163f78',
          800: '#0f2f5c',
          900: '#0b2a4a',
        },
        navy: {
          DEFAULT: '#0B2A4A',
          light: '#163F78',
          dark: '#071B31',
        },
        saffron: {
          50: '#fff5eb',
          100: '#ffe7cc',
          500: '#FF9933',
          600: '#e68a2e',
          700: '#b45f0c',
        },
        chakra: '#000080',
        govgreen: {
          500: '#138808',
          600: '#0f6e06',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
        },
        danger: {
          500: '#dc2626',
          600: '#b91c1c',
        },
        warning: {
          500: '#f59e0b',
          600: '#d97706',
        },
        success: {
          500: '#16a34a',
          600: '#15803d',
        },
      },
    },
  },
  plugins: [],
};
