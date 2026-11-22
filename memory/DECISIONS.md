# Approved Decisions

## Phased Delivery (V1 First)
- **Fact/Decision:** Start with a rock-solid V1 before layering on heavier advanced motion graphics or generative B-roll.
- **Context:** User confirmed V1-first approach on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active

## Content Categories Supported
- **Fact/Decision:** Support talking-head/educational, gaming, and vlog/cinematic editing styles from the start via category-aware AI director presets.
- **Context:** User confirmed all three categories are needed.
- **Date:** 2026-11-21
- **Status:** Active

## Persistent Memory Enabled
- **Fact/Decision:** Maintain project context and decisions in `memory/*.md` files.
- **Context:** User confirmed creating memory files on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active

## V2 Motion Graphics & Transitions Architecture (FFmpeg + libass)
- **Fact/Decision:** Use FFmpeg `xfade`/`acrossfade`, 2x supersampled `zoompan`, and `libass` `\p1` vector motion graphics + animated progress bar instead of Remotion/headless Chromium, and remove the redundant `gemini-3.5-transcribe` call in favor of single-pass multimodal `gemini-4-hydrogen`.
- **Context:** Fits cleanly inside the 4 GB RAM / 0-swap container while delivering transitions, camera motion, safe-zone-aware callout cards, modern fonts, and lower API quota usage. Approved by user on 2026-11-21.
- **Date:** 2026-11-21
- **Status:** Active
