# Technical Knowledge & Research Notes

## Server Environment Capabilities
- **Fact/Decision:** Container has `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`, Node.js `v22.23.2`, and 4096 MB RAM (0 swap).
- **Context:** Verified on 2026-11-21. Because RAM is 4 GB with no swap, server-side rendering should favor native FFmpeg filtergraphs + ASS kinetic subtitles + lightweight PNG/SVG overlay compositing rather than spawning heavy headless Chromium / Remotion render pools in the same container.
- **Date:** 2026-11-21
- **Status:** Active

## Industry Architecture Findings (OpusClip, Submagic, Captions)
- **Fact/Decision:** Production AI editors separate AI direction from deterministic rendering across 5 stages: (1) audio extraction + word-level timestamps, (2) LLM hook/highlight/style direction outputting structured JSON, (3) dynamic reframing / active-speaker crop tracking, (4) motion graphics and word-synced subtitle composition, and (5) FFmpeg final transcoding with audio normalization.
- **Context:** Web research conducted on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active

## Mobile Browser Video Handling
- **Fact/Decision:** Heavy FFmpeg.wasm processing crashes low-memory mobile browsers (especially iOS Safari). Best practice is client-side lightweight proxy/compression (or chunked upload) paired with server-side FFmpeg rendering and platform safe-zone overlays.
- **Context:** Web research conducted on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active

## Gemini 3.5 Transcribe & Video Director Resilience
- **Fact/Decision:** `gemini-3.5-transcribe` can return 404 NOT_FOUND on v1 endpoints; `transcribeAudioText` should catch 404/non-auth errors and fall back to `gemini-4-hydrogen` multimodal audio transcription, while `runAiDirector` provides JSON fence extraction, compact `inlineData` proxy support, and JPEG keyframe fallback.
- **Context:** Verified live against `job_mwqp2k56_gdthrl` on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active
