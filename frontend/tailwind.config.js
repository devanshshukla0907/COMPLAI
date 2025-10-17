/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // This is the crucial line
  ],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#1D2C5E',
        'brand-gold': '#B08D57',
        'brand-charcoal': '#333333',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}