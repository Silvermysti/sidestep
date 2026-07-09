// The thought parking lot.
//
// Thoughts can be jotted from TWO places — the redirect page (when a distraction
// is intercepted) and the popup (when one just pops into your head mid-work).
// Both go through this one function so they can never drift apart.

import { parkingLot } from './storage';

// Add a thought to the front of the list (newest first, so the one you just
// typed appears right under the box you typed it in). Empty or whitespace-only
// text saves nothing and returns false, so callers can leave the box untouched.
export async function parkThought(text) {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  const stored = await parkingLot.getValue();
  const list = Array.isArray(stored) ? stored : []; // never trust a corrupted value
  await parkingLot.setValue([{ text: clean, savedAt: Date.now(), done: false }, ...list]);
  return true;
}
