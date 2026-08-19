// Rotates a pending index to the front of a work queue, without dropping the
// skipped-over indices — they're rotated to the end instead, so the whole
// set still finishes eventually. Used by tts.worker.ts so jumping to a
// not-yet-synthesized chunk doesn't make playback wait for every chunk in
// between first.
//
// Rotates by ARRAY POSITION, not by numeric comparison against targetIndex.
// A numeric split (index >= target vs. < target) only works the first time,
// while `order` is still in ascending order. Once it's already been rotated
// once (e.g. jumped forward, then back), comparing by value breaks: going
// back to index 0 would put everything ">= 0" (i.e. the whole array) ahead
// of it, moving nothing. Rotating by position always works, in either
// direction, however many times.
export function reorderQueue(order: number[], targetIndex: number): number[] {
  const pos = order.indexOf(targetIndex);
  if (pos <= 0) return order; // not found, or already at the front
  return [...order.slice(pos), ...order.slice(0, pos)];
}
