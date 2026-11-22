# Active Projects

## CutCraft Studio (AI Short-Form Video Auto-Editor)
- **Fact/Decision:** Built and upgraded full-stack web application featuring a 2.5D isometric AI editing station home page (Three.js Orthographic with espresso bar, arcade console, Pixel studio cat, No Chatter toggle, zero-API roaming) and a V2 Express + FFmpeg 4.4.2 + Gemini 4 Hydrogen editing pipeline with true `xfade`/`acrossfade` transitions, 2x supersampled `zoompan` camera motion, ASS `\p1` vector motion graphics, animated retention progress bar, modern typography (`Liberation Sans`, `JetBrains Mono`, `DejaVu Sans`), film looks, and ReviewWorkspace timeline/overlay editors.
- **Context:** Researched 5 external video-editing skills/references and shipped V2 transitions + motion graphics engine on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active (V2 Transitions & Motion Graphics Upgrade)

### Implemented Stack
- **Frontend:** React + TypeScript + Tailwind CSS + Three.js (`StationScene`) + Lucide icons (`ReviewWorkspace` with Safe Zones, Caption Font, Film Look, Motion Graphics card editor, and Cut Camera/Transition editor)
- **Backend:** Node.js / Express (`server.ts`) with Multer upload, Byte-Range MP4 streaming, SSE progress, job retry endpoint, and disk-persisted job store (`/tmp/cutcraft-jobs`)
- **AI Engine:** `@google/genai` (`gemini-4-hydrogen` single-pass multimodal video+audio analysis, optional Google Search grounding with 429 guard, and keyframe fallback)
- **Media Engine:** Server-side `ffmpeg` 4.4.2 (`xfade`, `acrossfade`, 2x supersampled `zoompan`, `libass` `\p1` vector motion graphics + progress bar, `vignette`/`noise`, `loudnorm` -> 44.1kHz resample, and procedural transition/card SFX)
