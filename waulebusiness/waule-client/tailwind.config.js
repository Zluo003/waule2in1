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
        // 紫色主色调色板
        tiffany: {
          50: '#f5f0ff',   // 极浅
          100: '#ead5ff',  // 很浅
          200: '#d5aaff',  // 浅
          300: '#bf80ff',  // 中浅
          400: '#a855ff',  // 中等
          500: '#7a0fe8',  // 标准紫色 (主色)
          600: '#6b0dd1',  // 稍深紫色
          700: '#5c0bb8',  // 深
          800: '#4d099e',  // 很深
          900: '#3e0785',  // 极深
        },
        // 辅助色 - 珊瑚粉
        coral: {
          50: '#fff5f5',
          100: '#ffe5e5',
          200: '#ffc9c9',
          300: '#ffa3a3',
          400: '#ff7a7a',
          500: '#FF6B6B',  // 主辅助色
          600: '#e85555',
          700: '#d14343',
          800: '#b83737',
          900: '#a02f2f',
        },
        // 强调色 - 琥珀色
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#F59E0B',  // 主强调色
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // 主色（指向紫色）
        primary: {
          DEFAULT: '#7a0fe8',  // 主紫色
          light: '#6b0dd1',    // light mode
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
        // 背景色
        background: {
          light: '#f0f4f8',      // 浅色模式背景
          'light-secondary': '#e5e9ed',  // 稍深
          dark: '#050508',       // 深色模式背景
          'dark-secondary': '#0a0a0d',
        },
        // 卡片背景
        card: {
          light: '#fcfdfe',      // 卡片浅色
          'light-hover': '#f5f7f9',  // 悬停时稍暗
          dark: '#030304',
          'dark-hover': '#0a0a0d',
        },
        // 边框颜色
        border: {
          light: '#D1D5DB',      // 浅灰色边框
          'light-hover': '#9CA3AF',  // 悬停时稍深
          dark: '#374151',
          'dark-hover': '#4B5563',
        },
        // 文字颜色
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
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        '2xl': "1rem",
        '3xl': "1.5rem",
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
        'tiffany': '0 4px 20px -2px rgba(122, 15, 232, 0.2)',
        'tiffany-lg': '0 10px 40px -5px rgba(122, 15, 232, 0.3)',
      },
    },
  },
  plugins: [],
}

