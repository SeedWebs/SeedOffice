/** @type {import('tailwindcss').Config} */
// ธีมตรงกับ mockup.html (source of truth ของดีไซน์)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'Noto Sans Thai', 'sans-serif'] },
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
        },
      },
    },
  },
  plugins: [],
}
