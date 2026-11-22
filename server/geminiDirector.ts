import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import type {
  CameraMotion,
  CaptionFont,
  CaptionPhrase,
  EditScript,
  FilmLook,
  JobConfig,
  MediaInfo,
  MotionGraphicItem,
  PlatformTarget,
  ResearchSource,
  SilenceInterval,
  TranscriptPhrase,
  TransitionType,
} from '../src/types/editor.ts';
import { extractKeyframesForFallback } from './mediaPipeline.ts';

const MODEL_DIRECTOR = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isFatalApiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /API_KEY_INVALID|PERMISSION_DENIED|GEMINI_API_KEY|RESOURCE_EXHAUSTED|NOT_FOUND|\b401\b|\b403\b|\b404\b|\b429\b/i.test(
    msg,
  );
}

function extractJsonText(rawText: string): string {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned || '{}';
}

function getTargetAspectRatio(platform: PlatformTarget): '9:16' | '1:1' | '16:9' {
  if (platform === 'square') return '1:1';
  if (platform === 'landscape') return '16:9';
  return '9:16';
}

let searchGroundingSupported = true;

async function prepareVideoPart(ai: GoogleGenAI, proxyPath: string) {
  const fileSize = fs.statSync(proxyPath).size;

  // Prefer inlineData for compact analysis proxies (<= 8 MB) to avoid Files API polling failures
  if (fileSize <= 8 * 1024 * 1024) {
    return {
      part: {
        inlineData: {
          mimeType: 'video/mp4',
          data: fs.readFileSync(proxyPath).toString('base64'),
        },
      },
      uploadedName: null as string | null,
    };
  }

  try {
    const uploaded = await ai.files.upload({
      file: proxyPath,
      config: { mimeType: 'video/mp4' },
    });

    if (uploaded.name) {
      let fileState = uploaded;
      for (let i = 0; i < 30; i++) {
        if (fileState.state === 'ACTIVE') {
          return {
            part: {
              fileData: {
                fileUri: fileState.uri!,
                mimeType: fileState.mimeType || 'video/mp4',
              },
            },
            uploadedName: uploaded.name,
          };
        }
        if (fileState.state === 'FAILED') {
          throw new Error('Gemini file processing returned FAILED.');
        }
        await new Promise((r) => setTimeout(r, 1200));
        fileState = await ai.files.get({ name: uploaded.name });
      }
    }
  } catch (err) {
    if (isFatalApiError(err)) {
      throw err;
    }
    if (fileSize <= 14 * 1024 * 1024) {
      console.info('[prepareVideoPart] Using inline video proxy payload.');
      return {
        part: {
          inlineData: {
            mimeType: 'video/mp4',
            data: fs.readFileSync(proxyPath).toString('base64'),
          },
        },
        uploadedName: null as string | null,
      };
    }
    throw err;
  }

  if (fileSize <= 14 * 1024 * 1024) {
    return {
      part: {
        inlineData: {
          mimeType: 'video/mp4',
          data: fs.readFileSync(proxyPath).toString('base64'),
        },
      },
      uploadedName: null as string | null,
    };
  }
  throw new Error('Could not prepare video proxy for Gemini analysis.');
}

function normalizeCategory(v: unknown): 'talking_head' | 'gaming' | 'vlog_cinematic' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.includes('gam')) return 'gaming';
  if (s.includes('talk') || s.includes('edu')) return 'talking_head';
  return 'vlog_cinematic';
}

function normalizeCropFocus(
  v: unknown,
): 'auto' | 'center' | 'left' | 'right' | 'gaming_split' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'left' || s === 'right' || s === 'center' || s === 'gaming_split') return s;
  return 'auto';
}

function normalizeCaptionStyle(
  v: unknown,
): 'karaoke_bold' | 'pop_clean' | 'minimal_bottom' | 'none' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'pop_clean' || s === 'minimal_bottom' || s === 'none') return s;
  return 'karaoke_bold';
}

function normalizeCaptionFont(v: unknown): CaptionFont {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'jetbrains_mono' || s.includes('mono')) return 'jetbrains_mono';
  if (s === 'dejavu_sans' || s.includes('dejavu')) return 'dejavu_sans';
  return 'liberation_sans';
}

function normalizeColorPreset(
  v: unknown,
): 'natural' | 'studio_crisp' | 'cinematic_warm' | 'high_contrast' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'studio_crisp' || s === 'cinematic_warm' || s === 'high_contrast') return s;
  return 'natural';
}

function normalizeFilmLook(v: unknown): FilmLook {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'cinematic_vignette' || s.includes('vignette')) return 'cinematic_vignette';
  if (s === 'film_16mm' || s.includes('16mm') || s.includes('grain')) return 'film_16mm';
  return 'clean';
}

function normalizeIntensity(v: unknown): 'minimal' | 'balanced' | 'high_energy' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'minimal' || s === 'high_energy') return s;
  return 'balanced';
}

function normalizeCameraMotion(v: unknown): CameraMotion {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'push_in' || s === 'pull_out' || s === 'pan_left' || s === 'pan_right') {
    return s;
  }
  return 'static';
}

function normalizeTransition(v: unknown): TransitionType {
  const s = String(v ?? '').toLowerCase().trim();
  if (
    s === 'smoothleft' ||
    s === 'wipeleft' ||
    s === 'slideup' ||
    s === 'fadewhite' ||
    s === 'dissolve' ||
    s === 'circleopen'
  ) {
    return s;
  }
  if (s === 'flash') return 'fadewhite';
  return 'cut';
}

function normalizeMotionGraphicType(v: unknown): 'lower_third' | 'stat_callout' | 'keyword_badge' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'lower_third' || s === 'stat_callout') return s;
  return 'keyword_badge';
}

function normalizeAccentColor(v: unknown): 'amber' | 'cyan' | 'white' {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'cyan' || s === 'white') return s;
  return 'amber';
}

const RawEditScriptSchema = z.object({
  detectedCategory: z.any().optional(),
  hookTitle: z.string().optional().default('Watch this moment'),
  directorSummary: z.string().optional().default('Edited for maximum retention and clarity.'),
  researchInsights: z.array(z.string()).optional().default([]),
  cropFocus: z.any().optional(),
  captionStyle: z.any().optional(),
  captionFont: z.any().optional(),
  colorPreset: z.any().optional(),
  filmLook: z.any().optional(),
  editIntensity: z.any().optional(),
  showProgressBar: z.boolean().optional().default(true),
  motionGraphicsEnabled: z.boolean().optional().default(true),
  audioNormalize: z.boolean().optional().default(true),
  sfxEnabled: z.boolean().optional().default(true),
  segments: z
    .array(
      z.object({
        startSec: z.coerce.number(),
        endSec: z.coerce.number(),
        reason: z.string().optional().default('Key segment'),
        zoomPunch: z.coerce.number().optional(),
        cameraMotion: z.any().optional(),
        cropX: z.coerce.number().optional(),
        speed: z.coerce.number().optional(),
        transitionIn: z.any().optional(),
      }),
    )
    .optional()
    .default([]),
  captions: z
    .array(
      z.object({
        startSec: z.coerce.number(),
        endSec: z.coerce.number(),
        text: z.string(),
        emphasisWord: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  motionGraphics: z
    .array(
      z.object({
        type: z.any().optional(),
        startSec: z.coerce.number(),
        endSec: z.coerce.number(),
        title: z.string(),
        subtitle: z.string().optional(),
        accentColor: z.any().optional(),
      }),
    )
    .optional()
    .default([]),
  socialCopy: z
    .object({
      title: z.string().optional().default('New Short Edit'),
      description: z.string().optional().default('Edited automatically with CutCraft Studio.'),
      hashtags: z.array(z.string()).optional().default(['#shorts', '#videoedit']),
    })
    .optional(),
});

function sanitizeEditScript(
  raw: z.infer<typeof RawEditScriptSchema>,
  mediaInfo: MediaInfo,
  config: JobConfig,
  researchSources: ResearchSource[],
): EditScript {
  const maxDur = mediaInfo.durationSec;
  const minSpeed = mediaInfo.fps >= 24 ? 0.65 : 0.85;

  let segments = raw.segments
    .map((s, idx) => {
      const startSec = Math.max(0, Math.min(maxDur - 0.5, Number(s.startSec) || 0));
      const endSec = Math.max(startSec + 0.5, Math.min(maxDur, Number(s.endSec) || maxDur));
      return {
        id: `seg_${idx + 1}`,
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
        reason: (s.reason || 'Selected key moment').slice(0, 120),
        zoomPunch: Math.min(1.25, Math.max(1.0, Number(s.zoomPunch) || 1.0)),
        cameraMotion: normalizeCameraMotion(s.cameraMotion),
        cropX: Math.min(1.0, Math.max(0.0, Number(s.cropX ?? 0.5))),
        speed: Math.min(1.5, Math.max(minSpeed, Number(s.speed) || 1.0)),
        transitionIn: idx === 0 ? ('cut' as const) : normalizeTransition(s.transitionIn),
      };
    })
    .filter((s) => s.endSec - s.startSec >= 0.45);

  if (segments.length === 0) {
    const fallbackEnd = Math.min(maxDur, config.targetDurationSec);
    segments = [
      {
        id: 'seg_1',
        startSec: 0,
        endSec: Math.max(0.5, Math.round(fallbackEnd * 100) / 100),
        reason: 'Primary clip segment',
        zoomPunch: 1.05,
        cameraMotion: 'push_in',
        cropX: 0.5,
        speed: 1.0,
        transitionIn: 'cut',
      },
    ];
  }

  const cappedSegments = [];
  let accum = 0;
  for (const seg of segments) {
    const dur = (seg.endSec - seg.startSec) / seg.speed;
    if (accum + dur > 90 && cappedSegments.length > 0) break;
    cappedSegments.push(seg);
    accum += dur;
  }

  const captions: CaptionPhrase[] = raw.captions
    .map((c, idx) => ({
      id: `cap_${idx + 1}`,
      startSec: Math.max(0, Math.min(maxDur - 0.1, Number(c.startSec) || 0)),
      endSec: Math.max(0.15, Math.min(maxDur, Number(c.endSec) || 0.5)),
      text: String(c.text || '').trim().slice(0, 70),
      emphasisWord: c.emphasisWord?.trim(),
    }))
    .filter((c) => c.text.length > 0 && c.endSec > c.startSec + 0.08);

  const motionGraphics: MotionGraphicItem[] = (raw.motionGraphics || [])
    .map((mg, idx) => {
      const startSec = Math.max(0, Math.min(maxDur - 0.8, Number(mg.startSec) || 0));
      const endSec = Math.max(startSec + 1.1, Math.min(maxDur, Number(mg.endSec) || startSec + 2.4));
      return {
        id: `mg_${idx + 1}`,
        type: normalizeMotionGraphicType(mg.type),
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
        title: String(mg.title || '').trim().slice(0, 42),
        subtitle: mg.subtitle ? String(mg.subtitle).trim().slice(0, 56) : undefined,
        accentColor: normalizeAccentColor(mg.accentColor),
      };
    })
    .filter((mg) => mg.title.length > 0 && mg.endSec > mg.startSec + 0.8)
    .slice(0, 4);

  const insights =
    raw.researchInsights.length > 0
      ? raw.researchInsights.slice(0, 5)
      : ['Applied platform-safe vertical framing, smooth camera motion, and audio loudness normalization.'];

  return {
    detectedCategory: normalizeCategory(raw.detectedCategory),
    hookTitle: (raw.hookTitle || 'Watch till the end').trim().slice(0, 70),
    directorSummary: (raw.directorSummary || 'Structured edit compiled for mobile retention.').trim(),
    researchInsights: insights,
    researchSources,
    targetDurationSec: Math.round(accum * 10) / 10,
    aspectRatio: getTargetAspectRatio(config.platform),
    cropFocus: normalizeCropFocus(raw.cropFocus),
    captionStyle: normalizeCaptionStyle(raw.captionStyle),
    captionFont: normalizeCaptionFont(raw.captionFont),
    colorPreset: normalizeColorPreset(raw.colorPreset),
    filmLook: normalizeFilmLook(raw.filmLook),
    editIntensity: normalizeIntensity(raw.editIntensity),
    showProgressBar: Boolean(raw.showProgressBar),
    motionGraphicsEnabled: Boolean(raw.motionGraphicsEnabled),
    audioNormalize: Boolean(raw.audioNormalize),
    sfxEnabled: Boolean(raw.sfxEnabled),
    segments: cappedSegments,
    captions,
    motionGraphics,
    socialCopy: {
      title: (raw.socialCopy?.title || 'New Short Clip').trim(),
      description: (raw.socialCopy?.description || 'Edited automatically with CutCraft Studio.').trim(),
      hashtags: (raw.socialCopy?.hashtags || ['#shorts', '#tiktok']).slice(0, 8),
    },
  };
}

const EDIT_SCRIPT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedCategory: { type: Type.STRING },
    hookTitle: { type: Type.STRING },
    directorSummary: { type: Type.STRING },
    researchInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
    cropFocus: { type: Type.STRING },
    captionStyle: { type: Type.STRING },
    captionFont: { type: Type.STRING },
    colorPreset: { type: Type.STRING },
    filmLook: { type: Type.STRING },
    editIntensity: { type: Type.STRING },
    showProgressBar: { type: Type.BOOLEAN },
    motionGraphicsEnabled: { type: Type.BOOLEAN },
    audioNormalize: { type: Type.BOOLEAN },
    sfxEnabled: { type: Type.BOOLEAN },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: { type: Type.NUMBER },
          endSec: { type: Type.NUMBER },
          reason: { type: Type.STRING },
          zoomPunch: { type: Type.NUMBER },
          cameraMotion: { type: Type.STRING },
          cropX: { type: Type.NUMBER },
          speed: { type: Type.NUMBER },
          transitionIn: { type: Type.STRING },
        },
        required: ['startSec', 'endSec', 'reason'],
      },
    },
    captions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: { type: Type.NUMBER },
          endSec: { type: Type.NUMBER },
          text: { type: Type.STRING },
          emphasisWord: { type: Type.STRING },
        },
        required: ['startSec', 'endSec', 'text'],
      },
    },
    motionGraphics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          startSec: { type: Type.NUMBER },
          endSec: { type: Type.NUMBER },
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          accentColor: { type: Type.STRING },
        },
        required: ['type', 'startSec', 'endSec', 'title'],
      },
    },
    socialCopy: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['title', 'description', 'hashtags'],
    },
  },
  required: [
    'detectedCategory',
    'hookTitle',
    'directorSummary',
    'researchInsights',
    'cropFocus',
    'captionStyle',
    'captionFont',
    'colorPreset',
    'filmLook',
    'editIntensity',
    'showProgressBar',
    'motionGraphicsEnabled',
    'audioNormalize',
    'sfxEnabled',
    'segments',
    'captions',
    'motionGraphics',
    'socialCopy',
  ],
};

export async function runAiDirector(params: {
  proxyPath: string;
  mediaInfo: MediaInfo;
  silenceIntervals: SilenceInterval[];
  config: JobConfig;
  onPhase?: (phase: 'researching' | 'directing') => void;
}): Promise<{ editScript: EditScript; transcriptPhrases: TranscriptPhrase[] }> {
  const { proxyPath, mediaInfo, silenceIntervals, config, onPhase } = params;
  const ai = getAiClient();
  const workDir = path.dirname(proxyPath);

  onPhase?.('researching');
  const { part: videoPart, uploadedName } = await prepareVideoPart(ai, proxyPath);

  try {
    const silenceSummary =
      silenceIntervals.length > 0
        ? silenceIntervals
            .slice(0, 20)
            .map((s) => `${s.startSec.toFixed(2)}s-${s.endSec.toFixed(2)}s (${s.durationSec.toFixed(2)}s)`)
            .join(', ')
        : 'None detected.';

    let researchBrief = `Optimize ${config.platform} pacing, hook framing, intentional transitions, and kinetic motion graphics.`;
    const researchSources: ResearchSource[] = [];

    // Pass 1: Lightweight text-only Search-grounded creative brief (skipped automatically if quota-limited)
    if (searchGroundingSupported) {
      try {
        const researchTextPrompt = `You are a short-form video editor researching current pacing and motion graphic practices for a ${mediaInfo.durationSec.toFixed(1)}s ${config.styleMode} clip targeting ${config.platform} (requested duration ~${config.targetDurationSec}s).
User note: ${config.customPrompt || 'None'}.

Check current top-performing ${config.platform} editing practices (hook card, camera push-in rhythm, scene transitions, kinetic callouts, subtitle readability) for this style of clip. Summarize in 4 concise bullet points without emojis.`;

        const researchResponse = await ai.models.generateContent({
          model: MODEL_DIRECTOR,
          contents: researchTextPrompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        if (researchResponse.text) {
          researchBrief = researchResponse.text;
        }
        const rawChunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const seenUrls = new Set<string>();
        for (const chunk of rawChunks) {
          const uri = chunk.web?.uri;
          const title = chunk.web?.title;
          if (uri && title && !seenUrls.has(uri)) {
            seenUrls.add(uri);
            researchSources.push({ title, uri });
          }
          if (researchSources.length >= 4) break;
        }
      } catch (searchErr) {
        const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
        if (isFatalApiError(searchErr) && !/RESOURCE_EXHAUSTED|\b429\b/i.test(msg)) {
          throw searchErr;
        }
        if (/RESOURCE_EXHAUSTED|\b429\b/i.test(msg)) {
          searchGroundingSupported = false;
        }
        console.info('[runAiDirector] Search grounding skipped due to quota; proceeding with built-in video analysis.');
      }
    }

    onPhase?.('directing');
    const targetAspect = getTargetAspectRatio(config.platform);
    const minSpeedAllowed = mediaInfo.fps >= 24 ? 0.7 : 0.85;
    const compilePrompt = `You are compiling the final deterministic Edit Script JSON for our FFmpeg video engine.
Inspect both the video visuals and spoken audio directly in the clip.

Video Metadata:
- Source Dimensions: ${mediaInfo.width}x${mediaInfo.height} (fps: ${mediaInfo.fps})
- Source Duration: ${mediaInfo.durationSec.toFixed(2)} seconds
- Target Platform: ${config.platform} (Aspect Ratio: ${targetAspect})
- Target Edited Duration: ~${Math.min(config.targetDurationSec, mediaInfo.durationSec).toFixed(1)} seconds
- User Requested Style: ${config.styleMode}
- User Custom Note: ${config.customPrompt || 'None'}

Creative Research Brief:
${researchBrief}

Dead-Air Silences:
${silenceSummary}

Directing Rules:
1. Keep at least 60% of cuts as clean "cut" transitions; use xfade transitions ("smoothleft", "wipeleft", "slideup", "fadewhite", "dissolve", "circleopen") intentionally on beat shifts, topic pivots, or visual reveals. Segment 1 must always be "cut".
2. Use smooth cameraMotion ("push_in" on hooks/emphasis, "pull_out" on reveals, "pan_left"/"pan_right" on scenic b-roll, "static" on steady speech).
3. Include 2 to 4 non-overlapping motionGraphics callouts (placed after the opening 3s hook card) to highlight key stats, speaker/topic IDs, or punchy takeaways. Do NOT use emojis or em dashes.

Output a valid JSON object matching these exact keys and enum strings:
- detectedCategory: "talking_head" | "gaming" | "vlog_cinematic"
- cropFocus: "auto" | "center" | "left" | "right" | "gaming_split" (use "gaming_split" only if target is 9:16 and source is horizontal gaming with a webcam)
- captionStyle: "karaoke_bold" | "pop_clean" | "minimal_bottom" | "none" (use "none" if there is no spoken dialogue)
- captionFont: "liberation_sans" | "jetbrains_mono" | "dejavu_sans"
- colorPreset: "natural" | "studio_crisp" | "cinematic_warm" | "high_contrast"
- filmLook: "clean" | "cinematic_vignette" | "film_16mm"
- editIntensity: "minimal" | "balanced" | "high_energy"
- showProgressBar: boolean
- motionGraphicsEnabled: boolean
- audioNormalize: boolean
- sfxEnabled: boolean
- researchInsights: array of 2-4 concise insight strings
- segments: 1 to 10 ordered objects { startSec, endSec, reason, zoomPunch (1.0-1.18), cameraMotion ("static"|"push_in"|"pull_out"|"pan_left"|"pan_right"), cropX (0.0-1.0), speed (${minSpeedAllowed}-1.35), transitionIn ("cut"|"smoothleft"|"wipeleft"|"slideup"|"fadewhite"|"dissolve"|"circleopen") } within [0, ${mediaInfo.durationSec.toFixed(2)}]
- captions: array of { startSec, endSec, text, emphasisWord } for spoken 2-5 word phrases, or [] if no speech
- motionGraphics: 1 to 4 objects { type ("lower_third"|"stat_callout"|"keyword_badge"), startSec, endSec, title (2-5 words), subtitle (optional 2-6 words), accentColor ("amber"|"cyan"|"white") } with source timestamps inside chosen segments
- hookTitle: punchy 3 to 7 word hook title shown at top during opening 3 seconds (plain text, no emojis or em dashes)
- directorSummary: 1-2 sentence explanation of the edit choices
- socialCopy: { title, description, hashtags }`;

    const callWithBackoff = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/RESOURCE_EXHAUSTED|\b429\b/i.test(msg) && !/check your plan and billing/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 4000));
          return await fn();
        }
        throw err;
      }
    };

    let parsedJson: unknown = null;
    let lastCompileError: unknown = null;

    // Tier 1: Single Video multimodal + strict responseSchema
    try {
      const compileResponse = await callWithBackoff(() =>
        ai.models.generateContent({
          model: MODEL_DIRECTOR,
          contents: { parts: [videoPart, { text: compilePrompt }] },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: EDIT_SCRIPT_RESPONSE_SCHEMA,
          },
        }),
      );
      parsedJson = JSON.parse(extractJsonText(compileResponse.text ?? ''));
    } catch (err1) {
      if (isFatalApiError(err1)) throw err1;
      lastCompileError = err1;
      console.info('[runAiDirector] Switching to relaxed JSON director fallback.');
    }

    // Tier 2: Single Video multimodal + JSON MIME without strict responseSchema
    if (!parsedJson) {
      try {
        const compileResponse2 = await callWithBackoff(() =>
          ai.models.generateContent({
            model: MODEL_DIRECTOR,
            contents: { parts: [videoPart, { text: compilePrompt }] },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
            },
          }),
        );
        parsedJson = JSON.parse(extractJsonText(compileResponse2.text ?? ''));
      } catch (err2) {
        if (isFatalApiError(err2)) throw err2;
        lastCompileError = err2;
        console.info('[runAiDirector] Switching to keyframe director fallback.');
      }
    }

    // Tier 3: Extracted JPEG keyframes (guarantees resilience against video codec/fileData limits)
    if (!parsedJson) {
      const framePaths = await extractKeyframesForFallback(
        proxyPath,
        workDir,
        mediaInfo.durationSec,
        6,
      );
      try {
        const frameParts = framePaths.map((fp) => ({
          inlineData: {
            mimeType: 'image/jpeg',
            data: fs.readFileSync(fp).toString('base64'),
          },
        }));
        const compileResponse3 = await callWithBackoff(() =>
          ai.models.generateContent({
            model: MODEL_DIRECTOR,
            contents: {
              parts: [
                ...frameParts,
                {
                  text: `${compilePrompt}\n\nNote: Sampled ${framePaths.length} evenly-spaced video frames across ${mediaInfo.durationSec.toFixed(1)}s above.`,
                },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
            },
          }),
        );
        parsedJson = JSON.parse(extractJsonText(compileResponse3.text ?? ''));
      } catch (err3) {
        if (isFatalApiError(err3)) throw err3;
        throw lastCompileError instanceof Error ? lastCompileError : err3;
      } finally {
        const framesDir = path.join(workDir, 'fallback_frames');
        if (fs.existsSync(framesDir)) {
          fs.rmSync(framesDir, { recursive: true, force: true });
        }
      }
    }

    const validated = RawEditScriptSchema.parse(parsedJson);
    const editScript = sanitizeEditScript(validated, mediaInfo, config, researchSources);

    const transcriptPhrases: TranscriptPhrase[] = editScript.captions.map((c) => ({
      startSec: c.startSec,
      endSec: c.endSec,
      text: c.text,
    }));

    return { editScript, transcriptPhrases };
  } finally {
    if (uploadedName) {
      ai.files.delete({ name: uploadedName }).catch(() => {});
    }
  }
}

export async function tweakEditScriptWithAi(params: {
  currentScript: EditScript;
  mediaInfo: MediaInfo;
  transcript: TranscriptPhrase[];
  config: JobConfig;
  instruction: string;
}): Promise<EditScript> {
  const { currentScript, mediaInfo, transcript, config, instruction } = params;
  const ai = getAiClient();

  const prompt = `Update this existing Edit Script based on the user's plain-English feedback.
Source duration: ${mediaInfo.durationSec.toFixed(2)}s (fps: ${mediaInfo.fps}).
User request: "${instruction}"

Current Edit Script JSON:
${JSON.stringify(currentScript)}

Available Transcript:
${transcript.map((t) => `[${t.startSec.toFixed(2)}-${t.endSec.toFixed(2)}] ${t.text}`).join('\n')}

Valid values reminder:
- cameraMotion: "static" | "push_in" | "pull_out" | "pan_left" | "pan_right"
- transitionIn: "cut" | "smoothleft" | "wipeleft" | "slideup" | "fadewhite" | "dissolve" | "circleopen"
- captionFont: "liberation_sans" | "jetbrains_mono" | "dejavu_sans"
- filmLook: "clean" | "cinematic_vignette" | "film_16mm"
- motionGraphics[].type: "lower_third" | "stat_callout" | "keyword_badge"

Preserve valid timestamps within [0, ${mediaInfo.durationSec.toFixed(2)}]. Avoid emojis and em dashes.`;

  const response = await ai.models.generateContent({
    model: MODEL_DIRECTOR,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: EDIT_SCRIPT_RESPONSE_SCHEMA,
    },
  });

  const parsed = JSON.parse(extractJsonText(response.text ?? '{}'));
  const validated = RawEditScriptSchema.parse(parsed);
  return sanitizeEditScript(validated, mediaInfo, config, currentScript.researchSources);
}
