import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sidestep',
    description: 'A gentle focus tool that redirects distracting sites to your own goals.',
  },
});
