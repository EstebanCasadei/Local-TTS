import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KaraokeText } from "./KaraokeText.tsx";

const CHUNKS = ["Hola mundo adios"];
// Chunk starts at 0. The second entry is the next chunk's (real or
// sentinel) start time — buildTokens needs it to know this chunk's real
// duration (10s here); without it, it can only estimate from text length.
const CHUNK_START_TIMES = [0, 10];

const renderKaraoke = (position: number, duration: number) =>
  render(
    <KaraokeText
      chunkStartTimes={CHUNK_START_TIMES}
      chunks={CHUNKS}
      duration={duration}
      onSeek={vi.fn()}
      position={position}
    />,
  );

describe("KaraokeText", () => {
  it("renders the full text and highlights the first word at position 0", () => {
    renderKaraoke(0, 10);

    expect(screen.getByText("Hola")).toHaveClass("bg-action-primary/40");
    expect(screen.getByText("mundo")).toHaveClass("text-text-primary");
    expect(screen.getByText("adios")).toHaveClass("text-text-primary");
  });

  it("highlights the word at the approximate playback position", () => {
    // "Hola mundo adios" has 14 non-whitespace chars.
    // "Hola" occupies the first 4/14 of the timeline → ~2.86s.
    // "mundo" spans from ~2.86s to ~6.43s.
    renderKaraoke(5, 10);

    expect(screen.getByText("Hola")).toHaveClass("text-text-secondary");
    expect(screen.getByText("mundo")).toHaveClass("bg-action-primary/40");
    expect(screen.getByText("adios")).toHaveClass("text-text-primary");
  });

  it("dims all words once playback reaches the end", () => {
    renderKaraoke(10, 10);

    expect(screen.getByText("Hola")).toHaveClass("text-text-secondary");
    expect(screen.getByText("mundo")).toHaveClass("text-text-secondary");
    expect(screen.getByText("adios")).toHaveClass("bg-action-primary/40");
  });

  it("shows no active word when duration is zero", () => {
    renderKaraoke(0, 0);

    expect(screen.getByText("Hola")).not.toHaveClass("bg-action-primary/40");
    expect(screen.getByText("Hola")).toHaveClass("text-text-primary");
    expect(screen.getByText("mundo")).toHaveClass("text-text-primary");
  });

  it("preserves paragraph breaks and spaces", () => {
    render(
      <KaraokeText
        chunkStartTimes={[0, 5]}
        chunks={["Hola.", "Mundo."]}
        duration={10}
        onSeek={vi.fn()}
        position={0}
      />,
    );

    expect(screen.getByText("Hola.")).toHaveClass("bg-action-primary/40");
    expect(screen.getByText("Mundo.")).toHaveClass("text-text-primary");
  });

  it("calls onSeek with the word's chunk index and offset within it when clicked", () => {
    const onSeek = vi.fn();
    render(
      <KaraokeText
        chunkStartTimes={CHUNK_START_TIMES}
        chunks={CHUNKS}
        duration={10}
        onSeek={onSeek}
        position={0}
      />,
    );

    fireEvent.click(screen.getByText("mundo"));
    expect(onSeek).toHaveBeenCalledOnce();
    // Single chunk (index 0), starting at t=0 — offset within it equals the
    // word's absolute start time.
    expect(onSeek.mock.calls[0][0]).toBe(0);
    expect(onSeek.mock.calls[0][1]).toBeGreaterThan(0);
    expect(onSeek.mock.calls[0][1]).toBeLessThan(10);
  });

  it("resolves onSeek's chunk index relative to `chunks`, and offset relative to that chunk's start", () => {
    const onSeek = vi.fn();
    render(
      <KaraokeText
        chunkStartTimes={[0, 5]}
        chunks={["Hola.", "Mundo."]}
        duration={10}
        onSeek={onSeek}
        position={0}
      />,
    );

    fireEvent.click(screen.getByText("Mundo."));
    expect(onSeek).toHaveBeenCalledWith(1, expect.any(Number));
    expect(onSeek.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
  });

  it("doesn't stretch a chunk's word timings using an unrelated global duration", () => {
    // Chunk 0 is the only chunk shown (e.g. current chapter), starts at t=0,
    // and its own next chunk's start isn't known yet (chunkStartTimes has no
    // second entry). `duration` here is deliberately huge (300s) to simulate
    // chapter jumps having synthesized hundreds of seconds of unrelated
    // audio elsewhere in the book — it must NOT be used to size this ~1s
    // chunk's word spans, or the active word freezes for minutes at a real
    // position of 0.5s.
    render(
      <KaraokeText
        chunkStartTimes={[0]}
        chunks={CHUNKS}
        duration={300}
        onSeek={vi.fn()}
        position={0.5}
      />,
    );

    // "Hola mundo adios" (14 chars) at ~15 chars/sec is under 1s — "mundo"
    // should already be active at t=0.5s, not still on "Hola".
    expect(screen.getByText("mundo")).toHaveClass("bg-action-primary/40");
  });

  it("reports a small, sane offset for a chunk with no known real start time yet", () => {
    // Chunk 1 has no entry in chunkStartTimes (still synthesizing/unplayed) —
    // buildTokens internally offsets it by Number.MAX_SAFE_INTEGER so it can
    // never match as "active". Clicking a word in it must NOT leak that huge
    // number out as the seek offset.
    const onSeek = vi.fn();
    render(
      <KaraokeText
        chunkStartTimes={[0, undefined]}
        chunks={["Hola.", "Mundo."]}
        duration={10}
        onSeek={onSeek}
        position={0}
      />,
    );

    fireEvent.click(screen.getByText("Mundo."));
    expect(onSeek).toHaveBeenCalledWith(1, 0);
  });
});
