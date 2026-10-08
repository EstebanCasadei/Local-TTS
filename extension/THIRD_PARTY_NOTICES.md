# Runtime notices

LocalTTS includes @mintplex-labs/piper-tts-web (MIT), ONNX Runtime Web (MIT),
and @diffusionstudio/piper-wasm (MIT). Piper's phonemizer includes eSpeak NG
(GPL-3.0). Consult the upstream licenses and corresponding source before redistribution:

- https://github.com/Mintplex-Labs/piper-tts-web
- https://github.com/microsoft/onnxruntime/tree/v1.27.0
- https://github.com/diffusion-studio/piper-wasm
- https://github.com/rhasspy/piper
- https://github.com/espeak-ng/espeak-ng

The runtime versions and available upstream notices are copied into licenses/ during
the extension build. Voice models are downloaded separately from the Piper voice
repository; each model's upstream model card specifies its own licensing:
https://huggingface.co/diffusionstudio/piper-voices (download source)
https://huggingface.co/rhasspy/piper-voices (upstream model cards)

The panel uses the original Be Vietnam Pro typeface, bundled locally under the SIL Open Font License. Its license is included in licenses/be-vietnam-pro/OFL.txt. Font source: https://github.com/google/fonts/tree/main/ofl/bevietnampro
