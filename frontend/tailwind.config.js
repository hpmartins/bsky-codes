/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};
