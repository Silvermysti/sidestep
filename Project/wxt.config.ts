import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sidestep',
    description: 'A gentle focus timer that pauses distracting sites, catches the thought, and keeps you company.',
    // The toolbar/pinned icon. Chrome can fall back to `icons`, but naming it
    // here is what guarantees the pinned button shows our sprout.
    action: {
      default_title: 'Sidestep',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    // storage: save settings/timer/thoughts · alarms: wake us when a session ends ·
    // notifications: tell the user a session finished · webNavigation: watch page
    // loads so we can pause distracting sites · activeTab: read the current tab's
    // URL when the user clicks "Block the site I'm on" (granted only on that click).
    permissions: ['storage', 'alarms', 'notifications', 'webNavigation', 'activeTab'],
    // The floating on-page companion (content script) injects <img> tags that
    // point at these extension files, so the visited page must be allowed to load
    // them. Only the companion sprites are exposed, nothing else.
    web_accessible_resources: [
      {
        resources: ['fox/*', 'bunny/*', 'cat/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
