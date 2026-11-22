import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Film,
  RefreshCw,
  Sliders,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  CameraMotion,
  CaptionFont,
  CaptionPhrase,
  CaptionStyle,
  ColorGradePreset,
  CropFocusMode,
  EditIntensity,
  EditScript,
  FilmLook,
  MotionGraphicItem,
  TransitionType,
  VideoJob,
} from '../types/editor';

interface ReviewWorkspaceProps {
  job: VideoJob;
  onBackToStation: () => void;
  onNotify: (msg: string) => void;
  onJobUpdated: (job: VideoJob) => void;
}

type SafeZoneMode = 'off' | 'tiktok' | 'shorts' | 'reels';

export function ReviewWorkspace({
  job,
  onBackToStation,
  onNotify,
  onJobUpdated,
}: ReviewWorkspaceProps) {
  const [safeZone, setSafeZone] = useState<SafeZoneMode>('tiktok');
  const [activeTab, setActiveTab] = useState<'controls' | 'captions' | 'script' | 'copy'>('controls');
  const [tweakText, setTweakText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [draftScript, setDraftScript] = useState<EditScript | null>(job.editScript || null);

  useEffect(() => {
    if (job.editScript) {
      setDraftScript(job.editScript);
    }
  }, [job.editScript]);

  const isRendering =
    job.stage === 'rendering_draft' ||
    job.stage === 'exporting_hd' ||
    job.stage === 'directing';

  const activeVideoSrc = job.hdVideoUrl || job.draftVideoUrl || '';

  const handleRerender = async () => {
    if (!draftScript) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/rerender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftScript),
      });
      const data = (await res.json()) as { job?: VideoJob; error?: string };
      if (!res.ok || !data.job) {
        onNotify(data.error || 'Could not re-render preview. Try again.');
      } else {
        onJobUpdated(data.job);
        onNotify('Re-rendering preview with your updated controls.');
      }
    } catch {
      onNotify('Network error while starting re-render. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiTweak = async () => {
    const trimmed = tweakText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/tweak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });
      const data = (await res.json()) as { job?: VideoJob; error?: string };
      if (!res.ok || !data.job) {
        onNotify(data.error || 'Could not apply AI tweak. Try again.');
      } else {
        setTweakText('');
        onJobUpdated(data.job);
        onNotify('Gemini 4 Hydrogen is updating your Edit Script.');
      }
    } catch {
      onNotify('Network error while sending tweak. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportHd = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/export`, { method: 'POST' });
      const data = (await res.json()) as { job?: VideoJob; error?: string };
      if (!res.ok || !data.job) {
        onNotify(data.error || 'Could not start 1080p HD export.');
      } else {
        onJobUpdated(data.job);
        onNotify('Mastering 1080p HD export.');
      }
    } catch {
      onNotify('Network error starting HD export.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      onNotify(`${label} copied.`);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      onNotify('Could not copy to clipboard on this browser.');
    }
  };

  const updateCaptionText = (capId: string, newText: string) => {
    if (!draftScript) return;
    setDraftScript({
      ...draftScript,
      captions: draftScript.captions.map((c: CaptionPhrase) =>
        c.id === capId ? { ...c, text: newText } : c,
      ),
    });
  };

  const updateMotionGraphic = (
    mgId: string,
    patch: Partial<Pick<MotionGraphicItem, 'title' | 'subtitle'>>,
  ) => {
    if (!draftScript) return;
    setDraftScript({
      ...draftScript,
      motionGraphics: (draftScript.motionGraphics || []).map((mg) =>
        mg.id === mgId ? { ...mg, ...patch } : mg,
      ),
    });
  };

  const removeMotionGraphic = (mgId: string) => {
    if (!draftScript) return;
    setDraftScript({
      ...draftScript,
      motionGraphics: (draftScript.motionGraphics || []).filter((mg) => mg.id !== mgId),
    });
  };

  const updateSegmentMotion = (
    segId: string,
    patch: { cameraMotion?: CameraMotion; transitionIn?: TransitionType },
  ) => {
    if (!draftScript) return;
    setDraftScript({
      ...draftScript,
      segments: draftScript.segments.map((s) => (s.id === segId ? { ...s, ...patch } : s)),
    });
  };

  if (!draftScript) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D1015] p-6 text-center">
        <p className="text-sm text-slate-300">Edit Script is still being prepared.</p>
        <button
          type="button"
          onClick={onBackToStation}
          className="mt-4 min-h-[44px] rounded-lg border border-white/15 bg-[#141821] px-4 py-2 text-sm font-medium text-white"
        >
          Back to Station
        </button>
      </div>
    );
  }

  const isVertical = draftScript.aspectRatio === '9:16';

  return (
    <div className="min-h-screen bg-[#0D1015] text-slate-100">
      {/* Sticky Top Action Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-white/10 bg-[#141821] px-4 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={onBackToStation}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-300 hover:text-white whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Station</span>
        </button>

        <div className="hidden min-w-0 flex-1 text-center sm:block">
          <p className="truncate text-sm font-medium text-white">{job.originalFilename}</p>
          <p className="text-xs text-slate-400">
            <span>{draftScript.aspectRatio}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{draftScript.targetDurationSec}s</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{draftScript.detectedCategory.replace('_', ' ')}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {job.hdVideoUrl ? (
            <a
              href={`${job.hdVideoUrl}&download=1`}
              download
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>Save 1080p MP4</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={handleExportHd}
              disabled={isRendering || submitting}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap"
            >
              <Film className="h-4 w-4" />
              <span>{job.stage === 'exporting_hd' ? 'Exporting HD...' : 'Export 1080p HD'}</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-4 lg:grid-cols-12 lg:p-6">
        {/* Left Column: Mobile-Safe Preview Player + Safe-Zone Guides */}
        <section className="flex flex-col items-center lg:col-span-5">
          <div className="w-full max-w-[360px]">
            {/* Safe Zone Overlay Switcher */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Eye className="h-3.5 w-3.5 text-amber-400" />
                <span>Safe Zones</span>
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#141821] p-1">
                {(['off', 'tiktok', 'shorts', 'reels'] as SafeZoneMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSafeZone(mode)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      safeZone === mode
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {mode === 'shorts' ? 'Shorts' : mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Video Frame Container */}
            <div
              className={`relative w-full overflow-hidden rounded-lg border border-white/12 bg-black ${
                isVertical ? 'aspect-[9/16]' : draftScript.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-video'
              }`}
            >
              {activeVideoSrc ? (
                <video
                  key={activeVideoSrc}
                  src={activeVideoSrc}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
                  Rendering video preview...
                </div>
              )}

              {/* Platform Safe-Zone Visual Overlay (pointer-events-none so video controls remain usable) */}
              {isVertical && safeZone !== 'off' && (
                <div className="pointer-events-none absolute inset-0">
                  {/* Top unsafe bar */}
                  <div className="absolute inset-x-0 top-0 h-[10%] border-b border-dashed border-cyan-400/50 bg-cyan-950/20 px-3 pt-2">
                    <span className="text-[10px] font-medium text-cyan-300">
                      {safeZone.toUpperCase()} Top UI Zone
                    </span>
                  </div>
                  {/* Right action icons zone */}
                  <div className="absolute right-0 bottom-[18%] flex h-[38%] w-[16%] flex-col items-center justify-around border-l border-dashed border-amber-400/50 bg-amber-950/20 py-2">
                    <span className="h-5 w-5 rounded border border-amber-300/60" />
                    <span className="h-5 w-5 rounded border border-amber-300/60" />
                    <span className="h-5 w-5 rounded border border-amber-300/60" />
                  </div>
                  {/* Bottom caption/description zone */}
                  <div className="absolute inset-x-0 bottom-0 h-[23%] border-t border-dashed border-amber-400/50 bg-amber-950/25 px-3 pt-2">
                    <span className="text-[10px] font-medium text-amber-200">
                      {safeZone.toUpperCase()} Caption & UI Zone (kept clear)
                    </span>
                  </div>
                </div>
              )}

              {isRendering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-6 text-center">
                  <p className="text-sm font-semibold text-amber-300">{job.stageLabel}</p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-slate-300">
                    {job.progress}%
                  </p>
                </div>
              )}
            </div>

            {job.draftVideoUrl && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <a
                  href={`${job.draftVideoUrl}&download=1`}
                  download
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#141821] px-3 py-2 text-xs font-medium text-slate-200 hover:border-white/30"
                >
                  <Download className="h-4 w-4 text-slate-400" />
                  <span>Save Draft MP4</span>
                </a>
                {job.hdVideoUrl && (
                  <a
                    href={`${job.hdVideoUrl}&download=1`}
                    download
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    <Download className="h-4 w-4" />
                    <span>Save HD MP4</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: AI Director Notes + Controls + Captions + Edit Script */}
        <section className="space-y-5 lg:col-span-7">
          {/* AI Director Summary & Grounding Research */}
          <div className="rounded-lg border border-white/10 bg-[#141821] p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-white">
              AI Director Strategy
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              {draftScript.directorSummary}
            </p>
            {draftScript.researchInsights.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-300">
                {draftScript.researchInsights.map((tip, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-amber-400">{i + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}
            {draftScript.researchSources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-xs">
                <span className="text-slate-400">Research Sources:</span>
                {draftScript.researchSources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                  >
                    <span className="max-w-[180px] truncate">{src.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Ask AI to Tweak in Plain English */}
          <div className="rounded-lg border border-white/10 bg-[#141821] p-4">
            <label htmlFor="ai-tweak-input" className="block text-sm font-medium text-white">
              Ask Gemini 4 Hydrogen to Adjust Edit
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="ai-tweak-input"
                type="text"
                value={tweakText}
                onChange={(e) => setTweakText(e.target.value)}
                placeholder="e.g., Make the intro tighter and use clean pop captions..."
                className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAiTweak}
                disabled={submitting || isRendering || !tweakText.trim()}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1E293B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#293548] disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4 text-amber-400" />
                <span>Apply AI Tweak</span>
              </button>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="rounded-lg border border-white/10 bg-[#141821]">
            <div className="flex border-b border-white/10 px-2 pt-2">
              {[
                { id: 'controls', label: 'Controls', icon: Sliders },
                { id: 'captions', label: `Captions (${draftScript.captions.length})`, icon: Film },
                { id: 'script', label: 'Edit Script', icon: Code2 },
                { id: 'copy', label: 'Post Copy', icon: Copy },
              ].map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as typeof activeTab)}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'border-amber-400 text-amber-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-4 sm:p-5">
              {activeTab === 'controls' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="hook-title" className="block text-xs font-medium text-slate-300">
                      Opening Hook Title
                    </label>
                    <input
                      id="hook-title"
                      type="text"
                      value={draftScript.hookTitle}
                      onChange={(e) =>
                        setDraftScript({ ...draftScript, hookTitle: e.target.value })
                      }
                      className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="caption-style" className="block text-xs font-medium text-slate-300">
                        Caption Style
                      </label>
                      <select
                        id="caption-style"
                        value={draftScript.captionStyle}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            captionStyle: e.target.value as CaptionStyle,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="karaoke_bold">Karaoke Word Highlight</option>
                        <option value="pop_clean">Pop Clean Emphasis</option>
                        <option value="minimal_bottom">Minimal Dark Box</option>
                        <option value="none">No Captions</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="caption-font" className="block text-xs font-medium text-slate-300">
                        Typography Font
                      </label>
                      <select
                        id="caption-font"
                        value={draftScript.captionFont || 'liberation_sans'}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            captionFont: e.target.value as CaptionFont,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="liberation_sans">Clean Sans (Liberation)</option>
                        <option value="jetbrains_mono">Tech Mono (JetBrains Mono)</option>
                        <option value="dejavu_sans">Bold Geometric (DejaVu Sans)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="crop-focus" className="block text-xs font-medium text-slate-300">
                        Framing & Crop Focus
                      </label>
                      <select
                        id="crop-focus"
                        value={draftScript.cropFocus}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            cropFocus: e.target.value as CropFocusMode,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="auto">Auto Subject Focus</option>
                        <option value="center">Center Lock</option>
                        <option value="left">Left Side Focus</option>
                        <option value="right">Right Side Focus</option>
                        <option value="gaming_split">Gaming Split-Screen (9:16)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="color-preset" className="block text-xs font-medium text-slate-300">
                        Color Grade
                      </label>
                      <select
                        id="color-preset"
                        value={draftScript.colorPreset}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            colorPreset: e.target.value as ColorGradePreset,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="natural">Natural</option>
                        <option value="studio_crisp">Studio Crisp</option>
                        <option value="cinematic_warm">Cinematic Warm</option>
                        <option value="high_contrast">High Contrast</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="film-look" className="block text-xs font-medium text-slate-300">
                        Film Look & Texture
                      </label>
                      <select
                        id="film-look"
                        value={draftScript.filmLook || 'clean'}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            filmLook: e.target.value as FilmLook,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="clean">Clean Sharp</option>
                        <option value="cinematic_vignette">Cinematic Vignette</option>
                        <option value="film_16mm">16mm Film Grain</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-intensity" className="block text-xs font-medium text-slate-300">
                        Pacing Intensity
                      </label>
                      <select
                        id="edit-intensity"
                        value={draftScript.editIntensity}
                        onChange={(e) =>
                          setDraftScript({
                            ...draftScript,
                            editIntensity: e.target.value as EditIntensity,
                          })
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="minimal">Minimal</option>
                        <option value="balanced">Balanced</option>
                        <option value="high_energy">High Energy</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={draftScript.motionGraphicsEnabled ?? true}
                        onChange={(e) =>
                          setDraftScript({ ...draftScript, motionGraphicsEnabled: e.target.checked })
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span>Motion Graphic Cards</span>
                    </label>

                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={draftScript.showProgressBar ?? true}
                        onChange={(e) =>
                          setDraftScript({ ...draftScript, showProgressBar: e.target.checked })
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span>Top Retention Progress Bar</span>
                    </label>

                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={draftScript.audioNormalize}
                        onChange={(e) =>
                          setDraftScript({ ...draftScript, audioNormalize: e.target.checked })
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span>Normalize Audio (-14 LUFS)</span>
                    </label>

                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={draftScript.sfxEnabled}
                        onChange={(e) =>
                          setDraftScript({ ...draftScript, sfxEnabled: e.target.checked })
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span>Transition & Card SFX</span>
                    </label>
                  </div>

                  {(draftScript.motionGraphics || []).length > 0 && (
                    <div className="space-y-2.5 border-t border-white/10 pt-3">
                      <p className="text-xs font-medium text-slate-300">
                        Motion Graphic Overlays ({draftScript.motionGraphics.length})
                      </p>
                      <div className="space-y-2">
                        {draftScript.motionGraphics.map((mg) => (
                          <div
                            key={mg.id}
                            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-[#0D1015] p-3 sm:flex-row sm:items-center"
                          >
                            <div className="w-28 shrink-0">
                              <span className="inline-block rounded border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                                {mg.type.replace('_', ' ')}
                              </span>
                              <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                                {mg.startSec.toFixed(1)}s - {mg.endSec.toFixed(1)}s
                              </p>
                            </div>
                            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={mg.title}
                                aria-label="Overlay title"
                                onChange={(e) =>
                                  updateMotionGraphic(mg.id, { title: e.target.value })
                                }
                                placeholder="Overlay title"
                                className="min-h-[38px] rounded-md border border-white/10 bg-[#141821] px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                              <input
                                type="text"
                                value={mg.subtitle || ''}
                                aria-label="Overlay subtitle (Optional)"
                                onChange={(e) =>
                                  updateMotionGraphic(mg.id, { subtitle: e.target.value })
                                }
                                placeholder="Subtitle (Optional)"
                                className="min-h-[38px] rounded-md border border-white/10 bg-[#141821] px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMotionGraphic(mg.id)}
                              aria-label="Remove motion graphic"
                              className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:border-red-500/40 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRerender}
                    disabled={submitting || isRendering}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Re-Render Draft Preview</span>
                  </button>
                </div>
              )}

              {activeTab === 'captions' && (
                <div className="space-y-3">
                  {draftScript.captions.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No spoken captions detected in this clip.
                    </p>
                  ) : (
                    <>
                      <div className="max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                        {draftScript.captions.map((cap) => (
                          <div
                            key={cap.id}
                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0D1015] p-2.5"
                          >
                            <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-slate-400">
                              {cap.startSec.toFixed(1)}s-{cap.endSec.toFixed(1)}s
                            </span>
                            <input
                              type="text"
                              value={cap.text}
                              onChange={(e) => updateCaptionText(cap.id, e.target.value)}
                              className="min-h-[38px] flex-1 rounded-md border border-white/10 bg-[#141821] px-2.5 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleRerender}
                        disabled={submitting || isRendering}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>Apply Caption Edits</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'script' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Programmatic timeline cuts, camera motion, and transitions compiled by Gemini 4 Hydrogen:
                  </p>
                  <div className="space-y-2">
                    {draftScript.segments.map((seg, i) => (
                      <div
                        key={seg.id}
                        className="rounded-lg border border-white/10 bg-[#0D1015] p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-amber-300">
                          <span>
                            Cut {i + 1}: {seg.startSec.toFixed(2)}s - {seg.endSec.toFixed(2)}s
                          </span>
                          <span className="text-slate-400">
                            {seg.speed.toFixed(2)}x speed · zoom {seg.zoomPunch.toFixed(2)}x
                          </span>
                        </div>
                        <p className="mt-1 text-slate-300">{seg.reason}</p>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                            <span>Camera</span>
                            <select
                              value={seg.cameraMotion || 'static'}
                              onChange={(e) =>
                                updateSegmentMotion(seg.id, {
                                  cameraMotion: e.target.value as CameraMotion,
                                })
                              }
                              className="rounded border border-white/10 bg-[#141821] px-2 py-1 text-[11px] text-slate-200 focus:border-amber-400 focus:outline-none"
                            >
                              <option value="static">Static</option>
                              <option value="push_in">Push In</option>
                              <option value="pull_out">Pull Out</option>
                              <option value="pan_left">Pan Left</option>
                              <option value="pan_right">Pan Right</option>
                            </select>
                          </label>
                          <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                            <span>Transition In</span>
                            <select
                              value={i === 0 ? 'cut' : seg.transitionIn}
                              disabled={i === 0}
                              onChange={(e) =>
                                updateSegmentMotion(seg.id, {
                                  transitionIn: e.target.value as TransitionType,
                                })
                              }
                              className="rounded border border-white/10 bg-[#141821] px-2 py-1 text-[11px] text-slate-200 focus:border-amber-400 focus:outline-none disabled:opacity-50"
                            >
                              <option value="cut">Hard Cut</option>
                              <option value="smoothleft">Smooth Left</option>
                              <option value="wipeleft">Wipe Left</option>
                              <option value="slideup">Slide Up</option>
                              <option value="fadewhite">Flash White</option>
                              <option value="dissolve">Dissolve</option>
                              <option value="circleopen">Circle Open</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleRerender}
                    disabled={submitting || isRendering}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Apply Timeline Changes</span>
                  </button>
                  <pre className="max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-[#090C11] p-3 font-mono text-[11px] text-slate-300">
                    {JSON.stringify(draftScript, null, 2)}
                  </pre>
                </div>
              )}

              {activeTab === 'copy' && (
                <div className="space-y-4">
                  {[
                    { key: 'Title', value: draftScript.socialCopy.title },
                    { key: 'Description', value: draftScript.socialCopy.description },
                    {
                      key: 'Hashtags',
                      value: draftScript.socialCopy.hashtags
                        .map((h) => (h.startsWith('#') ? h : `#${h}`))
                        .join(' '),
                    },
                  ].map((item) => (
                    <div key={item.key} className="rounded-lg border border-white/10 bg-[#0D1015] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">{item.key}</span>
                        <button
                          type="button"
                          onClick={() => copyText(item.key, item.value)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-white/25"
                        >
                          {copiedField === item.key ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedField === item.key ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="mt-1.5 text-sm text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
