import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type {
  CaptionFont,
  CaptionPhrase,
  ColorGradePreset,
  CropFocusMode,
  CutSegment,
  EditScript,
  FilmLook,
  MediaInfo,
  MotionGraphicItem,
  SilenceInterval,
  TransitionType,
} from '../src/types/editor.ts';

function runProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const tail = stderr.slice(-1500);
        reject(new Error(`${bin} exited with code ${code}: ${tail}`));
      }
    });
  });
}

function parseFrameRate(rateStr?: string): number {
  if (!rateStr) return 30;
  const parts = rateStr.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && Number.isFinite(num / den) && num / den > 0) {
      return Math.min(120, Math.max(10, Math.round((num / den) * 100) / 100));
    }
  }
  const direct = Number(rateStr);
  return Number.isFinite(direct) && direct > 0 ? direct : 30;
}

export async function inspectMedia(inputPath: string): Promise<MediaInfo> {
  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      duration?: string;
      tags?: { rotate?: string };
      side_data_list?: Array<{ rotation?: number }>;
    }>;
  };

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error('No video stream found in the uploaded file.');
  }
  const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');

  let rotation = 0;
  if (videoStream.tags?.rotate) {
    rotation = Number(videoStream.tags.rotate) || 0;
  } else if (videoStream.side_data_list) {
    const rotData = videoStream.side_data_list.find((sd) => typeof sd.rotation === 'number');
    if (rotData && typeof rotData.rotation === 'number') {
      rotation = rotData.rotation;
    }
  }

  const rawWidth = videoStream.width || 1080;
  const rawHeight = videoStream.height || 1920;
  const normalizedRot = ((rotation % 360) + 360) % 360;
  const swapped = normalizedRot === 90 || normalizedRot === 270;

  const durationSec = Math.max(
    0.5,
    Number(parsed.format?.duration || videoStream.duration || 10) || 10,
  );

  return {
    width: swapped ? rawHeight : rawWidth,
    height: swapped ? rawWidth : rawHeight,
    durationSec: Math.round(durationSec * 100) / 100,
    fps: parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate),
    hasAudio: Boolean(audioStream),
    rotation: normalizedRot,
  };
}

export async function prepareAnalysisAssets(
  inputPath: string,
  workDir: string,
  mediaInfo: MediaInfo,
): Promise<{
  proxyPath: string;
  audioPath: string | null;
  silenceIntervals: SilenceInterval[];
}> {
  const proxyPath = path.join(workDir, 'analysis_proxy.mp4');
  const audioPath = mediaInfo.hasAudio ? path.join(workDir, 'analysis_audio.mp3') : null;

  // Build token-efficient 2-3fps proxy (keeps full audio + crisp scene layout under quota limits)
  const scaleExpr =
    mediaInfo.width >= mediaInfo.height ? 'scale=480:-2' : 'scale=-2:480';
  const proxyFps = mediaInfo.durationSec > 25 ? 2 : 3;
  await runProcess('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `${scaleExpr},fps=${proxyFps},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    ...(mediaInfo.hasAudio ? ['-c:a', 'aac', '-b:a', '48k', '-ac', '1'] : ['-an']),
    '-movflags',
    '+faststart',
    proxyPath,
  ]);

  let silenceIntervals: SilenceInterval[] = [];

  if (audioPath) {
    await runProcess('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-b:a',
      '64k',
      audioPath,
    ]);

    try {
      const { stderr } = await runProcess('ffmpeg', [
        '-i',
        audioPath,
        '-af',
        'silencedetect=noise=-32dB:d=0.35',
        '-f',
        'null',
        '-',
      ]);
      silenceIntervals = parseSilenceDetect(stderr);
    } catch {
      silenceIntervals = [];
    }
  }

  return { proxyPath, audioPath, silenceIntervals };
}

export async function extractKeyframesForFallback(
  proxyPath: string,
  workDir: string,
  durationSec: number,
  frameCount = 6,
): Promise<string[]> {
  const framesDir = path.join(workDir, 'fallback_frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const fpsVal = Math.max(0.08, Math.min(2, frameCount / Math.max(1, durationSec)));
  await runProcess('ffmpeg', [
    '-y',
    '-i',
    proxyPath,
    '-vf',
    `fps=${fpsVal.toFixed(4)},scale=360:-2`,
    '-frames:v',
    String(frameCount),
    '-q:v',
    '5',
    path.join(framesDir, 'frame_%02d.jpg'),
  ]);
  return fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(framesDir, f));
}

function parseSilenceDetect(stderr: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let currentStart: number | null = null;
  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      currentStart = Number(startMatch[1]);
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch && currentStart !== null) {
      intervals.push({
        startSec: Math.round(currentStart * 100) / 100,
        endSec: Math.round(Number(endMatch[1]) * 100) / 100,
        durationSec: Math.round(Number(endMatch[2]) * 100) / 100,
      });
      currentStart = null;
    }
  }
  return intervals;
}

interface TimelineSegmentEntry {
  seg: CutSegment;
  srcStart: number;
  srcEnd: number;
  speed: number;
  rawDur: number;
  overlapIn: number;
  transitionType: TransitionType;
  timelineStartSec: number;
  timelineEndSec: number;
}

function computeTimeline(
  segments: CutSegment[],
  mediaInfo: MediaInfo,
): { entries: TimelineSegmentEntry[]; totalOutDuration: number } {
  const entries: TimelineSegmentEntry[] = [];
  let accDuration = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const srcStart = Math.max(0, Math.min(mediaInfo.durationSec - 0.3, seg.startSec));
    const srcEnd = Math.max(srcStart + 0.3, Math.min(mediaInfo.durationSec, seg.endSec));
    // Clamp slow-mo safely for low-fps sources
    const minSpeed = mediaInfo.fps >= 24 ? 0.65 : 0.85;
    const speed = Math.min(1.5, Math.max(minSpeed, seg.speed || 1));
    const rawDur = Math.max(0.45, (srcEnd - srcStart) / speed);

    let overlapIn = 0;
    let transitionType: TransitionType = seg.transitionIn || 'cut';
    if (i > 0 && transitionType !== 'cut') {
      const prevDur = entries[i - 1].rawDur;
      if (prevDur >= 0.9 && rawDur >= 0.9) {
        overlapIn = Math.min(0.32, prevDur * 0.28, rawDur * 0.28);
        overlapIn = Math.round(overlapIn * 100) / 100;
        if (overlapIn < 0.12) {
          overlapIn = 0;
          transitionType = 'cut';
        }
      } else {
        transitionType = 'cut';
      }
    } else {
      transitionType = 'cut';
    }

    const timelineStartSec = Math.max(0, accDuration - overlapIn);
    const timelineEndSec = timelineStartSec + rawDur;
    accDuration = timelineEndSec;

    entries.push({
      seg,
      srcStart,
      srcEnd,
      speed,
      rawDur,
      overlapIn,
      transitionType,
      timelineStartSec,
      timelineEndSec,
    });
  }

  return { entries, totalOutDuration: Math.max(0.5, accDuration) };
}

function mapSourceTimeToTimeline(srcTime: number, entries: TimelineSegmentEntry[]): number | null {
  for (const entry of entries) {
    if (srcTime >= entry.srcStart - 0.05 && srcTime <= entry.srcEnd + 0.05) {
      const clamped = Math.max(entry.srcStart, Math.min(entry.srcEnd, srcTime));
      return entry.timelineStartSec + (clamped - entry.srcStart) / entry.speed;
    }
  }
  return null;
}

function remapCaptionsToEditedTimeline(
  editScript: EditScript,
  entries: TimelineSegmentEntry[],
): CaptionPhrase[] {
  const remapped: CaptionPhrase[] = [];
  for (const entry of entries) {
    for (const cap of editScript.captions) {
      const overlapStart = Math.max(entry.srcStart, cap.startSec);
      const overlapEnd = Math.min(entry.srcEnd, cap.endSec);
      if (overlapEnd - overlapStart > 0.12) {
        remapped.push({
          id: `${cap.id}_${entry.seg.id}`,
          startSec:
            Math.round((entry.timelineStartSec + (overlapStart - entry.srcStart) / entry.speed) * 100) /
            100,
          endSec:
            Math.round((entry.timelineStartSec + (overlapEnd - entry.srcStart) / entry.speed) * 100) /
            100,
          text: cap.text,
          emphasisWord: cap.emphasisWord,
        });
      }
    }
  }
  return remapped;
}

function remapMotionGraphicsToTimeline(
  editScript: EditScript,
  entries: TimelineSegmentEntry[],
  totalOutDuration: number,
): MotionGraphicItem[] {
  if (!editScript.motionGraphicsEnabled) return [];

  const mapped: MotionGraphicItem[] = [];
  for (const mg of editScript.motionGraphics || []) {
    const startT = mapSourceTimeToTimeline(mg.startSec, entries);
    const endT = mapSourceTimeToTimeline(mg.endSec, entries);
    if (startT === null && endT === null) continue;
    const s = Math.max(0.1, startT ?? 0.2);
    const e = Math.min(totalOutDuration - 0.1, Math.max(s + 1.4, endT ?? s + 2.2));
    if (e - s >= 0.9) {
      mapped.push({
        ...mg,
        startSec: Math.round(s * 100) / 100,
        endSec: Math.round(e * 100) / 100,
      });
    }
  }

  // Enforce non-overlapping screen scheduler (max 1 graphic at a time, clear of 0-3s hook card)
  mapped.sort((a, b) => a.startSec - b.startSec);
  const scheduled: MotionGraphicItem[] = [];
  let busyUntil = editScript.hookTitle ? Math.min(3.3, totalOutDuration * 0.55) : 0;

  for (const item of mapped) {
    if (item.type === 'hook_card') continue; // Hook card is handled by top opening card
    if (item.startSec < busyUntil + 0.25) continue;
    if (scheduled.length >= 4) break;
    scheduled.push(item);
    busyUntil = item.endSec;
  }
  return scheduled;
}

function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.min(99, Math.floor((clamped - Math.floor(clamped)) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function resolveFontName(font: CaptionFont): string {
  if (font === 'jetbrains_mono') return 'JetBrains Mono';
  if (font === 'dejavu_sans') return 'DejaVu Sans';
  return 'Liberation Sans';
}

function assAccentBgr(accent?: 'amber' | 'cyan' | 'white'): string {
  if (accent === 'cyan') return '&H00D4B606&'; // #06B6D4 in BGR
  if (accent === 'white') return '&H00F8FAFC&';
  return '&H000B9EF5&'; // #F59E0B Amber in BGR
}

function roundedRectAssDraw(w: number, h: number, r: number): string {
  const rad = Math.min(r, Math.floor(w / 3), Math.floor(h / 3));
  return (
    `m ${rad} 0 ` +
    `l ${w - rad} 0 ` +
    `b ${w} 0 ${w} 0 ${w} ${rad} ` +
    `l ${w} ${h - rad} ` +
    `b ${w} ${h} ${w} ${h} ${w - rad} ${h} ` +
    `l ${rad} ${h} ` +
    `b 0 ${h} 0 ${h} 0 ${h - rad} ` +
    `l 0 ${rad} ` +
    `b 0 0 0 0 ${rad} 0`
  );
}

function buildAssSubtitles(
  editScript: EditScript,
  remappedCaptions: CaptionPhrase[],
  scheduledGraphics: MotionGraphicItem[],
  outW: number,
  outH: number,
  totalOutDuration: number,
): string {
  const scaleFactor = outH / 1920;
  const fontName = resolveFontName(editScript.captionFont || 'liberation_sans');
  const captionFontSize = Math.max(26, Math.round(64 * scaleFactor));
  const minimalFontSize = Math.max(22, Math.round(46 * scaleFactor));
  const hookFontSize = Math.max(22, Math.round(48 * scaleFactor));
  const mgTitleSize = Math.max(20, Math.round(44 * scaleFactor));
  const mgSubSize = Math.max(15, Math.round(30 * scaleFactor));

  const isPortrait = outH >= outW;
  const marginBottom = isPortrait ? Math.round(outH * 0.25) : Math.round(outH * 0.1);
  const marginLR = Math.round(outW * 0.08);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${outW}
PlayResY: ${outH}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraokeBold,${fontName},${captionFontSize},&H000BB5F5,&H00FFFFFF,&H000D1015,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(5 * scaleFactor))},${Math.max(1, Math.round(3 * scaleFactor))},2,${marginLR},${marginLR},${marginBottom},1
Style: PopClean,${fontName},${captionFontSize},&H00FFFFFF,&H00FFFFFF,&H000D1015,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(4 * scaleFactor))},${Math.max(1, Math.round(2 * scaleFactor))},2,${marginLR},${marginLR},${marginBottom},1
Style: MinimalBox,${fontName},${minimalFontSize},&H00F3F4F6,&H00F3F4F6,&H000D1015,&H990D1015,-1,0,0,0,100,100,0,0,3,${Math.max(6, Math.round(12 * scaleFactor))},0,2,${marginLR},${marginLR},${Math.round(marginBottom * 0.85)},1
Style: VectorGfx,${fontName},${mgTitleSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HookText,${fontName},${hookFontSize},&H00FFFFFF,&H00FFFFFF,&H000D1015,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: MgTitle,${fontName},${mgTitleSize},&H00FFFFFF,&H00FFFFFF,&H000D1015,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,4,0,0,0,1
Style: MgSub,${fontName},${mgSubSize},&H00D5C5B4,&H00D5C5B4,&H000D1015,&H00000000,0,0,0,0,100,100,0,0,1,0,0,4,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];

  // 0. Animated Top Retention Progress Bar (track + smooth 0%->100% fill bar via libass)
  if (editScript.showProgressBar && totalOutDuration >= 0.5) {
    const endAll = formatAssTime(totalOutDuration);
    const totalMs = Math.max(100, Math.round(totalOutDuration * 1000));
    const barH = Math.max(5, Math.round(outH * 0.005));
    const barShape = `m 0 0 l ${outW} 0 l ${outW} ${barH} l 0 ${barH}`;
    // Subtle dark-translucent track
    events.push(
      `Dialogue: 8,0:00:00.00,${endAll},VectorGfx,,0,0,0,,{\\an7\\pos(0,0)\\1c&H000000&\\1a&H90&\\p1}${barShape}{\\p0}`,
    );
    // Smooth amber progress fill growing linearly from 0% to 100%
    events.push(
      `Dialogue: 9,0:00:00.00,${endAll},VectorGfx,,0,0,0,,{\\an7\\pos(0,0)\\1c&H0B9EF5&\\1a&H08&\\fscx0\\t(0,${totalMs},\\fscx100)\\p1}${barShape}{\\p0}`,
    );
  }

  // 1. Animated Vector Hook Title Card (opening 0.05s - 3.1s)
  const cleanHook = escapeAssText(editScript.hookTitle);
  if (cleanHook && totalOutDuration >= 1.5 && editScript.motionGraphicsEnabled) {
    const hookEnd = Math.min(3.1, totalOutDuration * 0.55);
    const startT = formatAssTime(0.05);
    const endT = formatAssTime(hookEnd);

    const cardW = Math.round(outW * 0.82);
    const cardH = Math.round(outH * 0.082);
    const cardX = Math.round((outW - cardW) / 2);
    const cardY = Math.round(outH * (isPortrait ? 0.115 : 0.075));
    const accentW = Math.max(8, Math.round(12 * scaleFactor));
    const rad = Math.max(8, Math.round(16 * scaleFactor));

    // Dark translucent rounded backing box sliding down smoothly
    events.push(
      `Dialogue: 2,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\move(${cardX},${cardY - 30},${cardX},${cardY},0,220)\\1c&H1C1510&\\1a&H18&\\bord2\\3c&H47382D&\\3a&H60&\\fad(120,220)\\p1}${roundedRectAssDraw(cardW, cardH, rad)}{\\p0}`,
    );
    // Expanding left amber accent stripe
    events.push(
      `Dialogue: 3,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\move(${cardX},${cardY - 30},${cardX},${cardY},0,220)\\1c&H0B9EF5&\\1a&H00&\\fscy10\\t(80,320,\\fscy100)\\fad(80,220)\\p1}${roundedRectAssDraw(accentW, cardH, 3)}{\\p0}`,
    );
    // Bold hook headline text centered inside card
    const textCenterX = Math.round(cardX + cardW / 2 + accentW / 2);
    const textCenterY = Math.round(cardY + cardH / 2);
    events.push(
      `Dialogue: 4,${startT},${endT},HookText,,0,0,0,,{\\an5\\move(${textCenterX},${textCenterY - 24},${textCenterX},${textCenterY},40,240)\\fad(120,200)}${cleanHook}`,
    );
  }

  // 2. Programmatic Motion Graphic Cards (lower_third, stat_callout, keyword_badge)
  for (const mg of scheduledGraphics) {
    const startT = formatAssTime(mg.startSec);
    const endT = formatAssTime(mg.endSec);
    const title = escapeAssText(mg.title);
    const subtitle = mg.subtitle ? escapeAssText(mg.subtitle) : '';
    const accentBgr = assAccentBgr(mg.accentColor);
    if (!title) continue;

    if (mg.type === 'lower_third') {
      const boxW = Math.round(outW * 0.68);
      const boxH = Math.round(outH * (subtitle ? 0.072 : 0.054));
      const targetX = Math.round(outW * 0.075);
      const targetY = Math.round(outH * (isPortrait ? 0.61 : 0.77));
      const barW = Math.max(8, Math.round(10 * scaleFactor));
      const offX = -boxW - 40;
      const rad = Math.max(6, Math.round(12 * scaleFactor));

      events.push(
        `Dialogue: 2,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\move(${offX},${targetY},${targetX},${targetY},0,240)\\1c&H1D1611&\\1a&H14&\\bord1.5\\3c&H4C3B2E&\\fad(80,220)\\p1}${roundedRectAssDraw(boxW, boxH, rad)}{\\p0}`,
      );
      events.push(
        `Dialogue: 3,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\move(${offX},${targetY},${targetX},${targetY},0,240)\\1c${accentBgr}\\1a&H00&\\fad(80,220)\\p1}${roundedRectAssDraw(barW, boxH, 2)}{\\p0}`,
      );
      const tx = targetX + barW + Math.round(18 * scaleFactor);
      const tyTitle = targetY + Math.round(boxH * (subtitle ? 0.34 : 0.5));
      events.push(
        `Dialogue: 4,${startT},${endT},MgTitle,,0,0,0,,{\\an4\\move(${offX + 24},${tyTitle},${tx},${tyTitle},60,260)\\fad(80,200)}${title}`,
      );
      if (subtitle) {
        const tySub = targetY + Math.round(boxH * 0.72);
        events.push(
          `Dialogue: 4,${startT},${endT},MgSub,,0,0,0,,{\\an4\\move(${offX + 24},${tySub},${tx},${tySub},90,280)\\fad(100,200)}${subtitle}`,
        );
      }
    } else {
      // stat_callout or keyword_badge: centered pop-in card in upper focus safe zone (y = 21%)
      const badgeW = Math.round(outW * 0.64);
      const badgeH = Math.round(outH * (subtitle ? 0.074 : 0.054));
      const badgeX = Math.round((outW - badgeW) / 2);
      const badgeY = Math.round(outH * (isPortrait ? 0.215 : 0.14));
      const rad = Math.max(8, Math.round(16 * scaleFactor));
      const pillTopH = Math.max(5, Math.round(7 * scaleFactor));

      events.push(
        `Dialogue: 2,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\pos(${badgeX},${badgeY})\\1c&H1B140F&\\1a&H14&\\bord2\\3c${accentBgr}\\3a&H35&\\fscx75\\fscy75\\t(0,130,\\fscx103\\fscy103)\\t(130,210,\\fscx100\\fscy100)\\fad(80,180)\\p1}${roundedRectAssDraw(badgeW, badgeH, rad)}{\\p0}`,
      );
      events.push(
        `Dialogue: 3,${startT},${endT},VectorGfx,,0,0,0,,{\\an7\\pos(${badgeX + Math.round(badgeW * 0.22)},${badgeY})\\1c${accentBgr}\\1a&H00&\\fad(80,180)\\p1}${roundedRectAssDraw(Math.round(badgeW * 0.56), pillTopH, 3)}{\\p0}`,
      );
      const cx = Math.round(badgeX + badgeW / 2);
      const cyTitle = badgeY + Math.round(badgeH * (subtitle ? 0.38 : 0.52));
      events.push(
        `Dialogue: 4,${startT},${endT},HookText,,0,0,0,,{\\an5\\pos(${cx},${cyTitle})\\c${accentBgr}\\fscx75\\fscy75\\t(0,130,\\fscx103\\fscy103)\\t(130,210,\\fscx100\\fscy100)\\fad(80,180)}${title}`,
      );
      if (subtitle) {
        const cySub = badgeY + Math.round(badgeH * 0.74);
        events.push(
          `Dialogue: 4,${startT},${endT},MgSub,,0,0,0,,{\\an5\\pos(${cx},${cySub})\\fad(110,180)}${subtitle}`,
        );
      }
    }
  }

  // 3. Spoken Kinetic Captions (strictly clear of bottom 25% UI zone)
  if (editScript.captionStyle !== 'none') {
    for (const phrase of remappedCaptions) {
      const clean = escapeAssText(phrase.text);
      if (!clean) continue;
      const start = formatAssTime(phrase.startSec);
      const end = formatAssTime(phrase.endSec);
      const durCs = Math.max(15, Math.round((phrase.endSec - phrase.startSec) * 100));

      if (editScript.captionStyle === 'karaoke_bold') {
        const words = clean.split(/\s+/).filter(Boolean);
        const perWordCs = Math.max(5, Math.floor(durCs / Math.max(1, words.length)));
        const karaokeLine = words
          .map((w, idx) => {
            const cs =
              idx === words.length - 1 ? Math.max(5, durCs - perWordCs * (words.length - 1)) : perWordCs;
            return `{\\kf${cs}}${w}`;
          })
          .join(' ');
        events.push(
          `Dialogue: 5,${start},${end},KaraokeBold,,0,0,0,,{\\fscx92\\fscy92\\t(0,80,\\fscx100\\fscy100)}${karaokeLine}`,
        );
      } else if (editScript.captionStyle === 'pop_clean') {
        const words = clean.split(/\s+/).filter(Boolean);
        const emp = phrase.emphasisWord?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const styled = words
          .map((w) => {
            const norm = w.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (emp && norm === emp) {
              return `{\\c&H000BB5F5&}${w}{\\c&H00FFFFFF&}`;
            }
            return w;
          })
          .join(' ');
        events.push(
          `Dialogue: 5,${start},${end},PopClean,,0,0,0,,{\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)}${styled}`,
        );
      } else {
        events.push(`Dialogue: 5,${start},${end},MinimalBox,,0,0,0,,{\\fad(60,60)}${clean}`);
      }
    }
  }

  return header + events.join('\n') + '\n';
}

function getOutputDimensions(
  aspectRatio: EditScript['aspectRatio'],
  quality: 'draft' | 'hd',
): { outW: number; outH: number } {
  if (aspectRatio === '1:1') {
    return quality === 'draft' ? { outW: 540, outH: 540 } : { outW: 1080, outH: 1080 };
  }
  if (aspectRatio === '16:9') {
    return quality === 'draft' ? { outW: 960, outH: 540 } : { outW: 1920, outH: 1080 };
  }
  return quality === 'draft' ? { outW: 540, outH: 960 } : { outW: 1080, outH: 1920 };
}

function getColorFilter(preset: ColorGradePreset): string {
  switch (preset) {
    case 'studio_crisp':
      return ',eq=contrast=1.06:saturation=1.08:brightness=0.02';
    case 'cinematic_warm':
      return ',eq=contrast=1.10:saturation=1.10:gamma=0.97,colorbalance=rs=0.04:gs=0.01:bs=-0.04';
    case 'high_contrast':
      return ',eq=contrast=1.14:saturation=1.18:brightness=-0.01';
    default:
      return '';
  }
}

function getFilmLookFilter(filmLook: FilmLook): string {
  switch (filmLook) {
    case 'cinematic_vignette':
      return ',vignette=PI/5,unsharp=5:5:0.45:5:5:0.0';
    case 'film_16mm':
      return ',vignette=PI/4.5,noise=alls=6:allf=t+u,eq=contrast=1.04:saturation=0.94';
    default:
      return ',unsharp=3:3:0.3:3:3:0.0';
  }
}

function resolveCropX(cropFocus: CropFocusMode, segCropX: number): number {
  if (cropFocus === 'left') return 0.15;
  if (cropFocus === 'center') return 0.5;
  if (cropFocus === 'right') return 0.85;
  return Math.min(1, Math.max(0, segCropX));
}

function mapXfadeTransition(t: TransitionType): string {
  switch (t) {
    case 'smoothleft':
      return 'smoothleft';
    case 'wipeleft':
      return 'wipeleft';
    case 'slideup':
      return 'slideup';
    case 'fadewhite':
    case 'flash':
      return 'fadewhite';
    case 'circleopen':
      return 'circleopen';
    case 'dissolve':
      return 'dissolve';
    default:
      return 'fade';
  }
}

export async function renderEditScript(params: {
  sourcePath: string;
  workDir: string;
  mediaInfo: MediaInfo;
  editScript: EditScript;
  outputPath: string;
  quality: 'draft' | 'hd';
}): Promise<void> {
  const { sourcePath, workDir, mediaInfo, editScript, outputPath, quality } = params;
  const { outW, outH } = getOutputDimensions(editScript.aspectRatio, quality);
  const targetAspect = outW / outH;
  const colorFilter = getColorFilter(editScript.colorPreset);
  const filmLookFilter = getFilmLookFilter(editScript.filmLook || 'clean');

  const { entries, totalOutDuration } = computeTimeline(editScript.segments, mediaInfo);
  const remappedCaptions = remapCaptionsToEditedTimeline(editScript, entries);
  const scheduledGraphics = remapMotionGraphicsToTimeline(editScript, entries, totalOutDuration);

  const assPath = path.join(workDir, `captions_${quality}.ass`);
  const assContent = buildAssSubtitles(
    editScript,
    remappedCaptions,
    scheduledGraphics,
    outW,
    outH,
    totalOutDuration,
  );
  fs.writeFileSync(assPath, assContent, 'utf8');

  const filterParts: string[] = [];
  const hasRealAudio = mediaInfo.hasAudio;

  // 1. Trim, normalize FPS/timebase/SAR, and apply 2x supersampled camera motion per segment
  entries.forEach((entry, idx) => {
    const { seg, srcStart, srcEnd, speed, rawDur } = entry;
    const zoom = Math.min(1.3, Math.max(1.0, seg.zoomPunch || 1));
    const cropX = resolveCropX(editScript.cropFocus, seg.cropX ?? 0.5);
    const vLabel = `v${idx}`;
    const aLabel = `a${idx}`;

    let geometryFilter = '';
    if (editScript.cropFocus === 'gaming_split' && editScript.aspectRatio === '9:16') {
      const topH = Math.round(outH * 0.38);
      const botH = outH - topH;
      geometryFilter =
        `split=2[gcam_${idx}][gplay_${idx}];` +
        `[gcam_${idx}]crop=iw*0.32:ih*0.38:iw*0.02:ih*0.04,scale=${outW}:${topH}:force_original_aspect_ratio=increase,crop=${outW}:${topH}[top_${idx}];` +
        `[gplay_${idx}]scale=${outW}:${botH}:force_original_aspect_ratio=increase,crop=${outW}:${botH}[bot_${idx}];` +
        `[top_${idx}][bot_${idx}]vstack=inputs=2`;
    } else if (seg.cameraMotion && seg.cameraMotion !== 'static' && rawDur >= 1.0) {
      // 2x supersampled smooth camera motion via zoompan (avoids 1px integer crop jitter)
      const totalFrames = Math.max(15, Math.round(rawDur * 30));
      const baseCrop =
        `crop='if(gt(iw/ih,${targetAspect.toFixed(4)}),ih*${targetAspect.toFixed(4)},iw)'` +
        `:'if(gt(iw/ih,${targetAspect.toFixed(4)}),ih,iw/${targetAspect.toFixed(4)})'` +
        `:'(iw-ow)*${cropX.toFixed(3)}'` +
        `:'(ih-oh)*0.38'`;
      const ssW = outW * 2;
      const ssH = outH * 2;
      let zpExpr = '';
      if (seg.cameraMotion === 'push_in') {
        zpExpr = `zoompan=z='1+0.13*(in/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=30`;
      } else if (seg.cameraMotion === 'pull_out') {
        zpExpr = `zoompan=z='1.13-0.13*(in/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=30`;
      } else if (seg.cameraMotion === 'pan_left') {
        zpExpr = `zoompan=z='1.12':x='(iw-iw/zoom)*(1-in/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=30`;
      } else {
        zpExpr = `zoompan=z='1.12':x='(iw-iw/zoom)*(in/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=30`;
      }
      geometryFilter = `${baseCrop},scale=${ssW}:${ssH}:flags=bilinear,${zpExpr}`;
    } else {
      const cropFilter =
        `crop='if(gt(iw/ih,${targetAspect.toFixed(4)}),ih*${targetAspect.toFixed(4)}/${zoom.toFixed(3)},iw/${zoom.toFixed(3)})'` +
        `:'if(gt(iw/ih,${targetAspect.toFixed(4)}),ih/${zoom.toFixed(3)},iw/${targetAspect.toFixed(4)}/${zoom.toFixed(3)})'` +
        `:'(iw-ow)*${cropX.toFixed(3)}'` +
        `:'(ih-oh)*0.38'`;
      geometryFilter = `${cropFilter},scale=${outW}:${outH}:flags=lanczos`;
    }

    filterParts.push(
      `[0:v]trim=start=${srcStart.toFixed(3)}:end=${srcEnd.toFixed(3)},setpts=(PTS-STARTPTS)/${speed.toFixed(3)},fps=30,${geometryFilter},settb=AVTB,setsar=1,format=yuv420p[${vLabel}]`,
    );

    if (hasRealAudio) {
      filterParts.push(
        `[0:a]atrim=start=${srcStart.toFixed(3)}:end=${srcEnd.toFixed(3)},asetpts=PTS-STARTPTS,atempo=${speed.toFixed(3)},aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[${aLabel}]`,
      );
    } else {
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${rawDur.toFixed(3)}[${aLabel}]`,
      );
    }
  });

  // 2. Chain segments using true xfade + acrossfade transitions (or hard concat when overlapIn === 0)
  let currentV = '[v0]';
  let currentA = '[a0]';
  const transitionTimestampsMs: number[] = [];

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const nextV = `[v_${i}_acc]`;
    const nextA = `[a_${i}_acc]`;

    if (entry.overlapIn > 0 && entry.transitionType !== 'cut') {
      const xfadeName = mapXfadeTransition(entry.transitionType);
      const offsetSec = Math.max(0.05, entry.timelineStartSec);
      transitionTimestampsMs.push(Math.max(0, Math.round(offsetSec * 1000)));
      filterParts.push(
        `${currentV}[v${i}]xfade=transition=${xfadeName}:duration=${entry.overlapIn.toFixed(3)}:offset=${offsetSec.toFixed(3)}${nextV}`,
      );
      filterParts.push(
        `${currentA}[a${i}]acrossfade=d=${entry.overlapIn.toFixed(3)}:c1=tri:c2=tri${nextA}`,
      );
    } else {
      filterParts.push(`${currentV}[v${i}]concat=n=2:v=1:a=0${nextV}`);
      filterParts.push(`${currentA}[a${i}]concat=n=2:v=0:a=1${nextA}`);
    }

    currentV = nextV;
    currentA = nextA;
  }

  // 3. Apply color grading, film look, and ASS vector motion graphics, progress bar + captions
  const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  filterParts.push(
    `${currentV}null${colorFilter}${filmLookFilter},ass='${escapedAss}'[vout]`,
  );

  // 4. Audio loudness normalization (resampled back to 44.1kHz stereo) + event-matched SFX
  let finalAudioPad = currentA;
  if (hasRealAudio && editScript.audioNormalize) {
    filterParts.push(
      `${finalAudioPad}loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[anorm]`,
    );
    finalAudioPad = '[anorm]';
  }

  if (editScript.sfxEnabled) {
    const sfxInputs: string[] = [];

    // Whoosh SFX on transitions
    transitionTimestampsMs.slice(0, 6).forEach((ms, wIdx) => {
      const wLabel = `whoosh_${wIdx}`;
      filterParts.push(
        `anoisesrc=color=pink:amplitude=0.16:duration=0.22:sample_rate=44100,bandpass=f=850:w=550,afade=t=in:ss=0:d=0.07,afade=t=out:st=0.09:d=0.13,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[${wLabel}]`,
      );
      sfxInputs.push(`[${wLabel}]`);
    });

    // Crisp pop chime SFX when kinetic motion graphics appear
    scheduledGraphics.slice(0, 4).forEach((mg, pIdx) => {
      const ms = Math.max(0, Math.round(mg.startSec * 1000));
      const pLabel = `pop_${pIdx}`;
      filterParts.push(
        `sine=frequency=1180:duration=0.09:sample_rate=44100,volume=0.12,afade=t=in:ss=0:d=0.01,afade=t=out:st=0.02:d=0.07,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[${pLabel}]`,
      );
      sfxInputs.push(`[${pLabel}]`);
    });

    if (sfxInputs.length > 0) {
      filterParts.push(
        `${finalAudioPad}${sfxInputs.join('')}amix=inputs=${1 + sfxInputs.length}:duration=first:normalize=0[aout]`,
      );
      finalAudioPad = '[aout]';
    }
  }

  const filterScriptPath = path.join(workDir, `filter_${quality}.txt`);
  fs.writeFileSync(filterScriptPath, filterParts.join(';\n'), 'utf8');

  const preset = quality === 'draft' ? 'ultrafast' : 'medium';
  const crf = quality === 'draft' ? '27' : '19';

  await runProcess('ffmpeg', [
    '-y',
    '-i',
    sourcePath,
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    '[vout]',
    '-map',
    finalAudioPad,
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    quality === 'draft' ? '128k' : '192k',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}
