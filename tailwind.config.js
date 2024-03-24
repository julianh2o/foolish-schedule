/** @type {import('tailwindcss').Config} */
export default {
  content: ["**/*{html,js}"],
  theme: {
    extend: {
      screens: {
        '3xl': '2400px',
      },
    },
  },
  safelist: [
    { pattern: /h-.*/, },
    { pattern: /ml-.*/, },
  ],
  plugins: [],
}
