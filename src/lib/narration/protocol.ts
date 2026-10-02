import type { ToneCategory } from "./profiles";

export const TONE_MODEL = "onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX";
export const TONE_SCHEMA = "nli-tone-v1";
export type ModelStatus = "idle" | "loading" | "ready" | "fallback";
export interface ModelUpdate {
  status: ModelStatus;
  progress?: number;
}
export interface ClassificationResult {
  labels: string[];
  scores: number[];
}
export const TONE_LABELS: Record<ToneCategory, string> = {
  neutral: "The passage is an objective description or neutral narration.",
  exclamation: "The passage expresses an exclamation, surprise or emphatic dialogue.",
  question: "The passage asks a question or expresses a direct inquiry.",
  tension: "The passage describes danger, tension or fast-paced action.",
  calm: "The passage expresses calm reflection, introspection or contemplation.",
};

export function selectTone(result: ClassificationResult): ToneCategory {
  if (
    result.labels.length !== result.scores.length ||
    result.scores.some((value) => !Number.isFinite(value) || value < 0)
  )
    return "neutral";
  const ranked = Object.entries(TONE_LABELS)
    .map(([category, label]) => ({
      category: category as ToneCategory,
      score: result.scores[result.labels.indexOf(label)] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
  // NLI scores are uncalibrated. A conservative margin is a routing policy,
  // never a claim about the probability that the category is correct.
  return ranked[0].score >= 0.55 && ranked[0].score - ranked[1].score >= 0.15
    ? ranked[0].category
    : "neutral";
}
