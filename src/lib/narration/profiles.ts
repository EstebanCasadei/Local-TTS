export const TONE_CATEGORIES = ["neutral", "exclamation", "question", "tension", "calm"] as const;
export type ToneCategory = (typeof TONE_CATEGORIES)[number];
export type Personality = "study" | "suspense" | "story" | "poetry";
export interface SynthesisParams {
  lengthScale: number;
  noiseScale: number;
  noiseWScale: number;
}
export interface NarrationOptions {
  enabled: boolean;
  personality: Personality;
}
export interface NarrationProfile {
  category: ToneCategory;
  params: SynthesisParams;
  gapMs: number;
}
export const DEFAULT_NARRATION: NarrationOptions = { enabled: false, personality: "study" };
export const NEUTRAL_PARAMS: SynthesisParams = {
  lengthScale: 1,
  noiseScale: 0.667,
  noiseWScale: 0.8,
};
export const PERSONALITIES: { id: Personality; label: string }[] = [
  { id: "study", label: "Estudio" },
  { id: "suspense", label: "Suspenso" },
  { id: "story", label: "Cuentos" },
  { id: "poetry", label: "Poesía" },
];

// Ordered as length, phoneme noise and duration noise. Keep changes modest:
// these controls alter prosody, not the speaker's emotional capabilities.
const PRESETS: Record<Personality, Record<ToneCategory, [number, number, number, number]>> = {
  study: {
    neutral: [1, 0.65, 0.75, 120],
    exclamation: [0.95, 0.75, 0.85, 120],
    question: [1, 0.7, 0.8, 120],
    tension: [0.95, 0.8, 0.9, 120],
    calm: [1.1, 0.6, 0.7, 120],
  },
  suspense: {
    neutral: [1, 0.7, 0.85, 400],
    exclamation: [0.85, 0.9, 1, 250],
    question: [1.1, 0.75, 0.9, 600],
    tension: [0.8, 1, 1, 1200],
    calm: [1.25, 0.55, 0.65, 900],
  },
  story: {
    neutral: [1.05, 0.65, 0.8, 300],
    exclamation: [0.85, 0.85, 0.95, 150],
    question: [1.05, 0.7, 0.85, 400],
    tension: [0.9, 0.85, 0.95, 800],
    calm: [1.2, 0.6, 0.7, 500],
  },
  poetry: {
    neutral: [1.15, 0.6, 0.75, 500],
    exclamation: [1, 0.8, 0.9, 300],
    question: [1.2, 0.65, 0.8, 500],
    tension: [0.9, 0.85, 0.95, 900],
    calm: [1.3, 0.5, 0.6, 1100],
  },
};

export function ruleTone(text: string): ToneCategory | null {
  const trimmed = text.trim();
  if (/[!！]["'»”)]*$/.test(trimmed)) return "exclamation";
  if (/[?？]["'»”)]*$/.test(trimmed)) return "question";
  const words = new Set(trimmed.toLocaleLowerCase("es").match(/[\p{L}]+/gu) ?? []);
  if (["gritó", "exclamó", "gritando"].some((word) => words.has(word))) return "exclamation";
  if (["disparo", "huyó", "estruendo", "pánico", "irrumpió"].some((word) => words.has(word)))
    return "tension";
  if (
    ["reflexionó", "meditó", "contempló", "tranquilidad", "reposo"].some((word) => words.has(word))
  )
    return "calm";
  return null;
}

export function profileFor(
  category: ToneCategory,
  options: NarrationOptions,
  previous?: ToneCategory,
): NarrationProfile {
  if (!options.enabled) return { category: "neutral", params: { ...NEUTRAL_PARAMS }, gapMs: 30 };
  const current = PRESETS[options.personality][category];
  const prior = previous ? PRESETS[options.personality][previous] : current;
  const blend = (index: number) => Number((prior[index] * 0.35 + current[index] * 0.65).toFixed(4));
  return {
    category,
    params: { lengthScale: blend(0), noiseScale: blend(1), noiseWScale: blend(2) },
    gapMs: current[3],
  };
}

export function synthesisCacheText(text: string, profile?: NarrationProfile): string {
  // Preserve every existing neutral hash. Version all adaptive audio by the
  // actual inference inputs; fallback/model decisions cannot share stale WAVs.
  return profile ? JSON.stringify(["adaptive-v1", text.trim(), profile.params]) : text.trim();
}
