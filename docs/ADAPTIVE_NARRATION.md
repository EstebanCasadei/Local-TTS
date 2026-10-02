# Adaptive narration

Implements the reading controls from issue #12 using the local NLI decision approach in `JevLocal`. The supplied PoC is a Jev-inspired interface backed by mDeBERTa, not Jev weights, and this implementation does not use a generative LLM or send document text to an inference API.

## User flow

Open the voices panel and enable **Narración adaptativa**. Choose Estudio, Suspenso, Cuentos or Poesía. This is disabled by default; preferences persist locally. Changing the style cancels previous synthesis and restarts at the active chunk/offset with the selected settings.

The five internal categories are `neutral`, `exclamation`, `question`, `tension` and `calm`. Punctuation and narrow Spanish lexical cues handle clear cases. Ambiguous passages can use the optional multilingual zero-shot model. The controls vary Piper length/noise/duration-noise scales and inter-chunk pauses; they do not turn a neutral speaker model into an emotion-trained voice.

## Execution and limits

- `profiles.ts` holds pure rules, profiles, adjacent-tone blending and versioned audio cache inputs.
- `toneClient.ts` checks local decisions before starting a nested worker. It keeps at most one inference in flight, limits the wait to 750 ms, and bounds its memory cache to 512 decisions.
- `tone.worker.ts` dynamically imports Transformers.js 4.3.0 and runs q8 mDeBERTa on WebGPU. Model loading is asynchronous; playback continues with rules/neutral while loading. Download failure, unsupported WebGPU and inference errors fall back locally.
- A timed-out inference may complete and cache its decision for later use. It does not retroactively replace audio already playing. Canceling synthesis terminates the classifier worker and releases its resources; late results are not persisted after cancellation.
- Typed NLI scores are **uncalibrated**. The score/margin threshold is a conservative policy, not a measured accuracy or probability guarantee. Domain accuracy and GPU performance still require measurement on Spanish texts and representative hardware.

The model repository is `onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX`. Quantized weights require approximately 338 MB plus tokenizer/runtime files. There is no CPU/WASM inference fallback for this model: avoiding a large slow CPU session is deliberate. Rule-based narration still works without WebGPU. Browsers reporting less than 4 GB via `deviceMemory` skip model loading; this capability hint is a precaution, not a guarantee against memory pressure.

Transformers tries `/models/<model-repository>/` first, then remote model files, and uses browser Cache Storage. To host locally, supply the repository's config/tokenizer files and `onnx/model_quantized.onnx` beneath that path in `public/models/`; preserve any associated external ONNX data files if the chosen artifact requires them. No model weights are committed here. Browser storage can be evicted; a cold download still requires network.

## Piper adapter and runtime versions

`patches/@mintplex-labs__piper-tts-web@1.0.5.patch`, registered through pnpm, adds optional synthesis scales to `TtsSession.predict(text, params)` and forwards them into the existing ONNX `scales` tensor. It preserves the original behavior when params are omitted. Never modify installed dependencies manually or drop the patch during updates without replacing this API.

Piper's peer `onnxruntime-web` is explicitly pinned to 1.27.0 to match the worker's CDN WASM paths. Transformers uses its own runtime in a separate worker. Do not upgrade Piper's runtime independently of those binaries.

## Persistence and cache correctness

Classifications are stored in IndexedDB `kv` under `nli-tone-v1:<full SHA-256 of text>`. No new database version or book/chunk IDs are required. Increase the schema version when the model, labels or decision policy changes. Rule decisions and cold-load fallback are not persisted as model predictions.

Neutral audio preserves its original cache namespace. Adaptive audio uses `<voiceId>~adaptive-<personality>` and hashes text plus actual smoothed synthesis parameters with the `adaptive-v1` schema. Each style can coexist with neutral WAVs; stale profiles cannot replay a WAV generated with different scales. Pauses are playback metadata and do not need to alter the WAV hash. Storage usage/deletion still operates on the existing book directory.

Smoothing uses the preceding textual chunk's category, not the previous synthesis request, so priority seeks do not blend against unrelated chapters. The playback queue tracks each chunk's gap for durations and seek offsets.

## Validation

Offline tests cover rules, typed decisions, ambiguous scores, timeouts, single-flight behavior, late-result caching, cancellation, profile scales, audio cache routing, UI controls, and non-uniform playback gaps. Worker integration tests check that parameters reach the Piper call. They do not measure real voice quality or GPU inference accuracy.

Before production acceptance, listen to Spanish samples in all four styles, compare warm/cold latency and playback buffering, test browser storage denial/model download failure, and check memory on Safari/iOS and lower-end devices. Do not enable this option by default based only on jsdom results.

Sources: [model card](https://huggingface.co/onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX), [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu).
