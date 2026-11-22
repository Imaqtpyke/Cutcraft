import { ArrowLeft, Upload, Video } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { ContentStyleMode, PlatformTarget, VideoJob } from '../types/editor';

interface CreateEditSheetProps {
  onClose: () => void;
  onJobCreated: (job: VideoJob) => void;
}

const PLATFORMS: Array<{ id: PlatformTarget; label: string; ratio: string }> = [
  { id: 'tiktok', label: 'TikTok', ratio: '9:16' },
  { id: 'shorts', label: 'YT Shorts', ratio: '9:16' },
  { id: 'reels', label: 'Reels', ratio: '9:16' },
  { id: 'square', label: 'Square', ratio: '1:1' },
  { id: 'landscape', label: 'Widescreen', ratio: '16:9' },
];

const DURATIONS = [15, 30, 45, 60];

const STYLES: Array<{ id: ContentStyleMode; label: string }> = [
  { id: 'auto', label: 'Auto-Detect' },
  { id: 'talking_head', label: 'Talking-Head' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'vlog_cinematic', label: 'Vlog / Cinematic' },
];

export function CreateEditSheet({ onClose, onJobCreated }: CreateEditSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<PlatformTarget>('tiktok');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<string>('30');
  const [useCustomDuration, setUseCustomDuration] = useState<boolean>(false);
  const [styleMode, setStyleMode] = useState<ContentStyleMode>('auto');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setSubmitError(null);
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > 250 * 1024 * 1024) {
      setFileError('This clip is over 250 MB. Please choose a shorter clip or compress it first.');
      return;
    }
    setFile(chosen);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFileError(null);
    setSubmitError(null);

    if (!file) {
      setFileError('Please select a video file from your phone or computer.');
      return;
    }

    const finalDuration = useCustomDuration
      ? Math.min(90, Math.max(10, Number(customDuration) || 30))
      : targetDurationSec;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('platform', platform);
    formData.append('targetDurationSec', String(finalDuration));
    formData.append('styleMode', styleMode);
    if (customPrompt.trim()) {
      formData.append('customPrompt', customPrompt.trim());
    }

    setUploading(true);
    setUploadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { job: VideoJob };
          onJobCreated(data.job);
        } catch {
          setSubmitError('Unexpected server response after upload. Please try again.');
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText) as { error?: string };
          setSubmitError(errData.error || 'Could not start editing job. Try again.');
        } catch {
          setSubmitError('Upload failed. Please check your connection and try again.');
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setSubmitError('Connection interrupted while uploading. Please try again.');
    };

    xhr.send(formData);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-edit-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-xl border border-white/12 bg-[#141821] shadow-2xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <h2 id="create-edit-title" className="font-display text-base font-semibold text-white">
            New Video Edit
          </h2>
          <div className="w-16" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {/* Single-column Field 1: Video Upload */}
          <div>
            <label htmlFor="video-upload" className="block text-sm font-medium text-slate-200">
              Source Video Clip
            </label>
            <label
              htmlFor="video-upload"
              className={`mt-2 flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
                fileError
                  ? 'border-red-500/70 bg-red-950/20'
                  : 'border-white/20 bg-[#0D1015] hover:border-amber-400/60'
              }`}
            >
              {file ? (
                <div className="flex items-center gap-3 text-left">
                  <Video className="h-6 w-6 shrink-0 text-amber-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{file.name}</p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB · Tap to change
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-amber-400" />
                  <span className="mt-2 text-sm font-medium text-slate-200">
                    Tap to pick video from phone or computer
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    MP4, MOV, or WebM · Up to 250 MB / 6 min
                  </span>
                </>
              )}
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            {fileError && <p className="mt-1.5 text-xs text-red-400">{fileError}</p>}
          </div>

          {/* Field 2: Target Platform */}
          <div>
            <span className="block text-sm font-medium text-slate-200">Target Platform</span>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PLATFORMS.map((p) => {
                const active = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`min-h-[44px] rounded-lg border px-2.5 py-2 text-center transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                        : 'border-white/10 bg-[#0D1015] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <span className="block text-xs font-semibold whitespace-nowrap">{p.label}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{p.ratio}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 3: Target Duration */}
          <div>
            <span className="block text-sm font-medium text-slate-200">Target Duration</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATIONS.map((sec) => {
                const active = !useCustomDuration && targetDurationSec === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setUseCustomDuration(false);
                      setTargetDurationSec(sec);
                    }}
                    className={`min-h-[44px] min-w-[64px] flex-1 rounded-lg border px-3 py-2 font-mono text-xs font-medium tabular-nums transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                        : 'border-white/10 bg-[#0D1015] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {sec}s
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUseCustomDuration(true)}
                className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  useCustomDuration
                    ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                    : 'border-white/10 bg-[#0D1015] text-slate-300 hover:border-white/25'
                }`}
              >
                Custom
              </button>
            </div>
            {useCustomDuration && (
              <div className="mt-2.5">
                <label htmlFor="custom-duration" className="block text-xs text-slate-400">
                  Custom seconds (10 to 90)
                </label>
                <input
                  id="custom-duration"
                  type="number"
                  min={10}
                  max={90}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Field 4: Content Style */}
          <div>
            <span className="block text-sm font-medium text-slate-200">Editing Style</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STYLES.map((s) => {
                const active = styleMode === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyleMode(s.id)}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                        : 'border-white/10 bg-[#0D1015] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 5: Optional Creative Note */}
          <div>
            <label htmlFor="creative-note" className="block text-sm font-medium text-slate-200">
              Creative Direction (Optional)
            </label>
            <textarea
              id="creative-note"
              rows={2}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Focus on the punchline at the end, keep captions bold and clean..."
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0D1015] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {uploading && (
            <div className="rounded-lg border border-white/10 bg-[#0D1015] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Uploading footage to station...</span>
                <span className="font-mono tabular-nums text-amber-400">{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
              {submitError}
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={uploading}
              className="min-h-[48px] w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Uploading Video...' : 'Send to AI Editor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
