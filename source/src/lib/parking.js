import { parkingLot } from './storage';

export async function parkThought(text) {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  const stored = await parkingLot.getValue();
  const list = Array.isArray(stored) ? stored : [];
  await parkingLot.setValue([{ text: clean, savedAt: Date.now(), done: false }, ...list]);
  return true;
}
