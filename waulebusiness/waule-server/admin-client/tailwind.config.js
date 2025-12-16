/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7a0fe8',
          light: '#6b0dd1',
          50: '#f5f0ff',
          100: '#ead5ff',
          200: '#d5aaff',
          300: '#bf80ff',
          400: '#a855ff',
          500: '#7a0fe8',
          600: '#6b0dd1',
          700: '#5c0bb8',
          800: '#4d099e',
          900: '#3e0785',
        },
        background: {
          light: '#f0f4f8',
          'light-secondary': '#e5e9ed',
          dark: '#050508',
          'dark-secondary': '#0a0a0d',
        },
        card: {
          light: '#fcfdfe',
          'light-hover': '#f5f7f9',
          dark: '#030304',
          'dark-hover': '#0a0a0d',
        },
        border: {
          light: '#D1D5DB',
          'light-hover': '#9CA3AF',
          dark: '#374151',
          'dark-hover': '#4B5563',
        },
        text: {
          light: {
            primary: '#111827',
            secondary: '#6B7280',
            tertiary: '#9CA3AF',
          },
          dark: {
            primary: '#F9FAFB',
            secondary: '#D1D5DB',
            tertiary: '#9CA3AF',
          },
        },
      },
      fontFamily: {
        display: ["'Noto Sans SC'", "sans-serif"],
      },
    },
  },
  plugins: [],
}







