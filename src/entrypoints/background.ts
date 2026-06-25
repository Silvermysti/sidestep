// The BACKGROUND service worker — the "brain".
//
// It is the only place that OWNS the timer. The popup just sends it commands
// (messages) and reads the result from storage. The background also sets a
// `chrome.alarms` alarm so it gets woken up exactly when a session ends — even
// if it has gone to sleep in the meantime (service workers sleep to save memory,
// which is why a normal setInterval countdown would NOT survive here).

import { settings, timer } from '@/lib/storage';
import {
  startState,
  pauseState,
  resumeState,
  resetState,
  setModeState,
  completeState,
} from '@/lib/timer';

const TIMER_ALARM = 'sidestep-timer-end';

export default defineBackground(() => {
  // Commands coming from the popup.
  browser.runtime.onMessage.addListener((message) => {
    return handleCommand(message);
  });

  // The clock waking us up when a session is due to finish.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TIMER_ALARM) handleSessionEnd();
  });
});

async function handleCommand(message: any) {
  const action = message?.action;
  if (!action) return;

  const [t, s] = await Promise.all([timer.getValue(), settings.getValue()]);
  let next = t;

  switch (action) {
    case 'start':
      next = startState(t, s);
      break;
    case 'pause':
      next = pauseState(t);
      break;
    case 'resume':
      next = resumeState(t);
      break;
    case 'reset':
      next = resetState(t, s);
      break;
    case 'setMode':
      next = setModeState(t, s, message.mode);
      break;
    default:
      return;
  }

  await timer.setValue(next);
  await syncAlarm(next);
  return next;
}

// Keep the alarm in sync with the timer: one alarm when running, none otherwise.
async function syncAlarm(t: any) {
  await browser.alarms.clear(TIMER_ALARM);
  if (t.status === 'running' && t.endsAt) {
    browser.alarms.create(TIMER_ALARM, { when: t.endsAt });
  }
}

// A session reached zero: flip focus<->break, go idle, and notify the user.
async function handleSessionEnd() {
  const [t, s] = await Promise.all([timer.getValue(), settings.getValue()]);
  const finishedMode = t.mode;
  await timer.setValue(completeState(t, s));
  await browser.alarms.clear(TIMER_ALARM);
  notify(finishedMode);
}

function notify(finishedMode: string) {
  const isFocus = finishedMode === 'focus';
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: isFocus ? 'Focus session complete' : 'Break over',
    message: isFocus
      ? 'Nice work. Time for a short break.'
      : 'Break done — ready to focus again?',
  });
}
