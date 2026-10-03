# Complete audiobook MP3 export

Open **Acciones del documento → Descargar audiolibro MP3** in the reader. Inspection is local and does not start synthesis. The confirmation shows the active voice, estimated duration/size, cached and missing chunks, available storage and a conservative required-space allowance. Export uses that voice at normal speed, mono, 64 kbps, with the reader's 30 ms inter-chunk gaps. Ambient audio, bookmarks, notes and chapter navigation metadata are not embedded.

## Processing and resource limits

An `ExportClient` owns a dedicated instance of `tts.worker.ts`. Inspection and MP3 requests are distinct from playback requests. Before starting, `useTts.pauseForExport()` invalidates stale callbacks, records the active chunk/local offset and its known global start, terminates the playback worker and disposes playback/decode contexts and buffers. Ambient audio is paused. Resume is manual and rebuilds the reading queue from the saved point; the known start anchors its clock even when earlier chunks decode later.

`mp3ExportWorker.ts` reads cache entries matching the current voice and trimmed-text hash. Missing/unreadable/corrupt chunks are synthesized sequentially. Generated WAVs are not added to the persistent book cache during export: this avoids growing an entire uncompressed audiobook on disk. Therefore another export may need to generate those chunks again. Existing audio/model caches remain intact.

`mp3Export.ts` validates mono 16-bit RIFF PCM, including extra/padded RIFF sections, and feeds bounded PCM blocks into **one** LAME encoder session. Mixed sample rates or missing/invalid audio abort the book; an incomplete file is never offered as a complete audiobook. Do not concatenate independently finalized MP3 chunks: that changes stream framing and can break duration/seeking.

The encoder is `wasm-media-encoders` 0.7.0, imported dynamically on explicit export. Its MP3 asset is approximately 183 KB uncompressed in this build. No FFmpeg, generative model, audio recording or server conversion is required. Encoding and synthesis run outside the main thread.

Output is written synchronously to OPFS `mp3-exports/export-<uuid>.mp3`. The application holds one WAV/PCM chunk plus encoder working buffers instead of all book WAVs or a growing MP3 byte array. Browser-managed File/Blob downloads can still consume memory, so constant browser-wide memory usage is not guaranteed.

Both preflight estimates and actual writes enforce a **256 MiB** output limit. At 64 kbps this is about nine hours of audio, subject to frame padding and estimates. Longer estimated books are blocked with a clear message. Storage preflight requires estimated output × 1.2, an allowance for missing voice files, and 8 MiB of headroom. Browser quotas and other tabs can change afterward; write failures still abort safely. The user also needs room in their final download destination, which the app cannot inspect.

## Estimates and progress

Size is approximately 8,000 bytes per audio second (28.8 MB/hour), plus a small framing allowance. Cached WAV sample counts give known speech duration; missing speech uses the cached seconds-per-character ratio, or the project's default rate. Inter-chunk gaps are included. Even fully cached output size remains an estimate because of MP3 padding.

Remaining processing time is shown after three completed chunks, using observed elapsed work per processed character. It is approximate, can change when moving between cached and synthesized audio, and does not predict a cold model download accurately. Initial model-download progress is reported separately. No fixed processing-time promise is shown before measuring the device.

The dialog explains CPU/battery/storage costs, local processing, possible model/runtime downloads, throttling or suspension in background tabs, the need to keep the page/device active, and cancellation. Export has no cross-page or cross-session continuation.

## Cancellation, files and recovery

Cancel/close/unmount terminates the export worker and rejects pending requests. Cleanup retries removing the temporary file after the worker releases its handle. Completed output retains its File/blob URL until the dialog closes; the user should finish downloading before closing. Closing revokes that URL and cleans the temporary copy. Worker memory is freed as soon as export completes, without waiting for the dialog to close.

Abrupt browser/device shutdown can leave temporary files. The next inspection removes this application's matching exports older than 24 hours, ignoring locked files and never touching book audio. Cleanup is best-effort; these files can temporarily occupy quota. Empty voice files left by an interrupted worker are treated as missing, rather than poisoning the next model download.

OPFS and worker synchronous access handles are required. Unsupported/denied storage is reported before preparation where possible; no large in-memory fallback is started.

## Verification

Tests cover real WASM MP3 encoding, padded RIFF parsing, sample-rate mismatches, missing audio, size/duration estimates, explicit confirmation, storage blocking, worker cancellation/cleanup, retained complete files, and playback resource release/resume with a known clock anchor. Existing playback tests remain applicable.

A Chromium smoke test exported the welcome book with 22 uncached chunks, downloaded a 366,759-byte MP3, and decoded it successfully as mono audio of approximately 45.8 seconds. A later test reused all 22 cached chunks and preserved the reading clock at 00:17 before export, while paused and after manual resume. This does not establish large-book peak memory or Safari/iOS compatibility; those still require real-device testing.

Encoder API/source: [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders). Keep the package's third-party licensing and upstream notices available when distributing its encoder.
