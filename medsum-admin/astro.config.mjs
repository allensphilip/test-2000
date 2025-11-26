// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: process.env.APP_URL,
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react()],

  output: 'server',

  adapter: node({
    mode: 'standalone',
  }),
});
