import { describe, expect, it } from "vitest";
import {
  DEFAULT_NARRATION,
  NEUTRAL_PARAMS,
  PERSONALITIES,
  profileFor,
  ruleTone,
  synthesisCacheText,
} from "./profiles";
import { selectTone, TONE_LABELS } from "./protocol";

describe("adaptive narration profiles", () => {
  it("recognizes Spanish punctuation and lexical cues without a model", () => {
    expect(ruleTone("¿Dónde estás?»")).toBe("question");
    expect(ruleTone("¡Corre ahora!")).toBe("exclamation");
    expect(ruleTone("Un disparo lo hizo saltar.")).toBe("tension");
    expect(ruleTone("Ella meditó en silencio.")).toBe("calm");
    expect(ruleTone("El río recorre la ciudad.")).toBeNull();
  });

  it("uses neutral parameters and the original gap when disabled for every personality", () => {
    for (const item of PERSONALITIES) {
      expect(profileFor("tension", { enabled: false, personality: item.id }, "calm")).toEqual({
        category: "neutral",
        params: NEUTRAL_PARAMS,
        gapMs: 30,
      });
    }
  });

  it("smooths adjacent tones deterministically and uses personality-specific gaps", () => {
    const options = { enabled: true, personality: "suspense" as const };
    const current = profileFor("tension", options);
    const prior = profileFor("calm", options);
    const blended = profileFor("tension", options, "calm");
    expect(blended.params.lengthScale).toBeGreaterThan(current.params.lengthScale);
    expect(blended.params.lengthScale).toBeLessThan(prior.params.lengthScale);
    expect(blended.gapMs).toBe(1200);
    expect(profileFor("tension", { enabled: true, personality: "study" }).gapMs).toBe(120);
  });

  it("preserves legacy neutral cache inputs and invalidates changed synthesis inputs", () => {
    expect(synthesisCacheText(" text ")).toBe("text");
    const profile = profileFor("neutral", { ...DEFAULT_NARRATION, enabled: true });
    expect(synthesisCacheText("text", profile)).not.toBe("text");
    expect(synthesisCacheText("text", profile)).not.toBe(
      synthesisCacheText("text", { ...profile, params: { ...profile.params, lengthScale: 1.1 } }),
    );
  });
});

describe("bounded NLI decisions", () => {
  it("maps sorted output labels to typed categories without generating text", () => {
    expect(
      selectTone({ labels: [TONE_LABELS.tension, TONE_LABELS.neutral], scores: [0.8, 0.2] }),
    ).toBe("tension");
  });
  it("uses neutral for ambiguous or malformed model scores", () => {
    expect(
      selectTone({ labels: [TONE_LABELS.tension, TONE_LABELS.calm], scores: [0.51, 0.49] }),
    ).toBe("neutral");
    expect(selectTone({ labels: [TONE_LABELS.tension], scores: [NaN] })).toBe("neutral");
    expect(selectTone({ labels: [], scores: [] })).toBe("neutral");
  });
});
