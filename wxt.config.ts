import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sidestep',
    description: 'A gentle focus tool that redirects distracting sites to your own goals.',
    // storage: save settings/timer · alarms: wake us when a session ends ·
    // notifications: tell the user a session finished.
    permissions: ['storage', 'alarms', 'notifications'],
  },
});
