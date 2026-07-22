export const THEMES = {
  meadow: {
    label: 'Meadow',
    bg: 'url(/scene/background.png)',
    grass: '/scene/grass.png',
    tile: 1571,
    dot: '#8CC98C',
    unlockAt: 0,
  },
  autumn: {
    label: 'Autumn',
    bg: 'url(/scene/autumn-bg.png)',
    grass: '/scene/autumn-grass.png',
    tile: 1459,
    dot: '#E7A184',
    pos: 'center 100%',
    zoom: '125%',
    unlockAt: 120,
  },
  rainy: {
    label: 'Rainy',
    bg: 'url(/scene/rainy-bg.png)',
    grass: '/scene/rainy-grass.png',
    tile: 1743,
    dot: '#9DA6EE',
    pos: 'center 75%',
    zoom: '133%',
    grassBottom: '0%',
    grassHeight: '62%',
    unlockAt: 240,
  },
};

export const THEME_KEYS = Object.keys(THEMES);
export const DEFAULT_THEME = 'meadow';

export function isThemeUnlocked(key, xp) {
  return (xp ?? 0) >= (THEMES[key]?.unlockAt ?? 0);
}

export function unlockedThemeKeys(xp) {
  return THEME_KEYS.filter((k) => isThemeUnlocked(k, xp));
}
