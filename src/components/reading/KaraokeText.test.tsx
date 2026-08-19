import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KaraokeText } from "./KaraokeText.tsx";

const CHUNKS = ["Hola mundo adios"];

const renderKaraoke = (position: number, duration: number) =>
  render(
    <KaraokeText
      chunkStartTimes={[]}
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
        chunkStartTimes={[]}
        chunks={["Hola.", "Mundo."]}
        duration={10}
        onSeek={vi.fn()}
        position={0}
      />,
    );

    expect(screen.getByText("Hola.")).toHaveClass("bg-action-primary/40");
    expect(screen.getByText("Mundo.")).toHaveClass("text-text-primary");
  });

  it("calls onSeek with the word's start time when a word is clicked", () => {
    const onSeek = vi.fn();
    render(
      <KaraokeText
        chunkStartTimes={[]}
        chunks={CHUNKS}
        duration={10}
        onSeek={onSeek}
        position={0}
      />,
    );

    fireEvent.click(screen.getByText("mundo"));
    expect(onSeek).toHaveBeenCalledOnce();
    expect(onSeek.mock.calls[0][0]).toBeGreaterThan(0);
    expect(onSeek.mock.calls[0][0]).toBeLessThan(10);
  });
});
