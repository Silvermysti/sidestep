import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sidestep',
    description: 'A gentle focus timer that pauses distracting sites, catches the thought, and keeps you company.',

    action: {
      default_title: 'Sidestep',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },

    permissions: ['storage', 'alarms', 'notifications', 'webNavigation', 'activeTab', 'offscreen'],

    web_accessible_resources: [
      {
        resources: ['fox/*', 'bunny/*', 'cat/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
