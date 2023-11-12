import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import daisyui from 'daisyui';

const config = {
  content: [
    './src/**/*.{html,js,svelte,ts}',
  ],
  theme: {
    extend: {}
  },
  plugins: [
    forms,
    typography,
    daisyui,
  ],
  daisyui: {
    themes: [
      {
        gsw: {
          "primary": "#1D428A",
          "secondary": "#FFC72C",
          "accent": "#1dcdbc",
          "neutral": "#2b3440",
          "base-100": "#ffffff",
          "info": "#3abff8",
          "success": "#36d399",
          "warning": "#fbbd23",
          "error": "#f87272",
        },
      },
    ],
  },
} satisfies Config;

export default config;
