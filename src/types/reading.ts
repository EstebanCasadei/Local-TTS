export type ReadingState = {
  isPlaying: boolean;
  speed: number;
  voice: string;
  personality: string;
  tonal: boolean;
};

// Timing slice for the karaoke highlight — not the persisted `Chunk` in book.ts.
export type KaraokeChunk = {
  text: string;
  start: number;
  end: number;
};
