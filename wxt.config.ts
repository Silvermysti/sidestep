import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sidestep',
    description: 'A gentle focus tool that redirects distracting sites to your own goals.',
    // storage: save settings/timer/lists · alarms: wake us when a session ends ·
    // notifications: tell the user a session finished · webNavigation: watch page
    // loads so we can redirect distracting sites · activeTab: read the current
    // tab's URL when the user clicks "Save this page" (granted only on that click).
    permissions: ['storage', 'alarms', 'notifications', 'webNavigation', 'activeTab'],
  },
});
