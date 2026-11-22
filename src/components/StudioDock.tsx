import {
  ChevronDown,
  ChevronUp,
  Film,
  FolderOpen,
  MessageSquare,
  MessageSquareOff,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import type { VideoJob } from '../types/editor';

interface StudioDockProps {
  activeJob: VideoJob | null;
  jobCount: number;
  chatterEnabled: boolean;
  onToggleChatter: () => void;
  onNewEdit: () => void;
  onOpenRecent: () => void;
  onOpenReview: (job: VideoJob) => void;
  onRetryJob: (jobId: string) => void;
  onDismissError: () => void;
}

export function StudioDock({
  activeJob,
  jobCount,
  chatterEnabled,
  onToggleChatter,
  onNewEdit,
  onOpenRecent,
  onOpenReview,
  onRetryJob,
  onDismissError,
}: StudioDockProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isRunning =
    activeJob &&
    activeJob.stage !== 'ready' &&
    activeJob.stage !== 'completed' &&
    activeJob.stage !== 'error';

  const isReady = activeJob && (activeJob.stage === 'ready' || activeJob.stage === 'completed');
  const isError = activeJob && activeJob.stage === 'error';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center px-3 sm:bottom-5">
      <div className="pointer-events-auto flex w-full max-w-[820px] flex-col items-center">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mb-1.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-white/15 bg-[#141821]/95 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span>{collapsed ? 'Show Controls' : 'Hide Controls'}</span>
        </button>

        {!collapsed && (
          <div className="w-full rounded-lg border border-white/12 bg-[#141821]/95 p-3 shadow-2xl sm:p-4">
            {isRunning && activeJob && (
              <div className="mb-3 rounded-md border border-amber-500/30 bg-[#1B212E] p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-amber-300">
                    {activeJob.stageLabel}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-slate-300">
                    {activeJob.progress}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[#0D1015]">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${Math.max(5, activeJob.progress)}%` }}
                  />
                </div>
              </div>
            )}

            {isError && activeJob && (
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-100">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-red-200">{activeJob.stageLabel}</p>
                  <p className="mt-0.5 text-red-200/90">{activeJob.errorMessage}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRetryJob(activeJob.id)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="min-h-[36px] shrink-0 rounded-md border border-red-400/40 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-900/50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {isReady && activeJob
                    ? `Ready: ${activeJob.originalFilename}`
                    : isRunning && activeJob
                      ? `Editing: ${activeJob.originalFilename}`
                      : 'AI Editing Station'}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {isReady && activeJob?.editScript
                    ? `${activeJob.editScript.targetDurationSec}s · ${activeJob.editScript.aspectRatio} · ${activeJob.editScript.detectedCategory.replace('_', ' ')}`
                    : isRunning
                      ? 'Editor moved to workstation while pipeline runs'
                      : 'Tap coffee, arcade, sofa, or cat in the studio · Idle uses zero quota'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleChatter}
                  aria-label={chatterEnabled ? 'Mute sprite chatter' : 'Enable sprite chatter'}
                  aria-pressed={!chatterEnabled}
                  title={chatterEnabled ? 'No Chatter' : 'Chatter Muted (Tap to Enable)'}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    chatterEnabled
                      ? 'border-white/15 bg-[#1B212E] text-slate-300 hover:border-white/30 hover:text-white'
                      : 'border-amber-400/50 bg-amber-500/15 text-amber-300 hover:border-amber-400'
                  }`}
                >
                  {chatterEnabled ? (
                    <MessageSquare className="h-4 w-4 text-slate-300" />
                  ) : (
                    <MessageSquareOff className="h-4 w-4 text-amber-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onOpenRecent}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-[#1B212E] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap"
                >
                  <FolderOpen className="h-4 w-4 text-slate-400" />
                  <span>Clips ({jobCount})</span>
                </button>

                {isReady && activeJob ? (
                  <button
                    type="button"
                    onClick={() => onOpenReview(activeJob)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-amber-300 whitespace-nowrap"
                  >
                    <Film className="h-4 w-4" />
                    <span>Open Preview</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onNewEdit}
                    disabled={Boolean(isRunning)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-300 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Edit</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
