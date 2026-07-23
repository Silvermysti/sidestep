const DING = chrome.runtime.getURL('/sounds/ding.mp3');

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action !== 'sidestep-play-ding') return;
  const audio = new Audio(DING);
  audio.volume = 0.7;
  audio.play().catch(() => {});
});
