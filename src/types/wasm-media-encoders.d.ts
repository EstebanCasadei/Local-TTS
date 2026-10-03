declare module "wasm-media-encoders" {
  export interface Mp3Encoder {
    configure(options: { channels: number; sampleRate: number; bitrate: number }): void;
    encode(samples: Float32Array[]): Uint8Array;
    finalize(): Uint8Array;
  }
  export function createMp3Encoder(): Promise<Mp3Encoder>;
}
