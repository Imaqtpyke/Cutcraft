import { ArrowLeft, Film, Trash2 } from 'lucide-react';
import type { VideoJob } from '../types/editor';

interface RecentJobsDrawerProps {
  jobs: VideoJob[];
  loading: boolean;
  onClose: () => void;
  onSelectJob: (job: VideoJob) => void;
  onDeleteJob: (jobId: string) => void;
}

export function RecentJobsDrawer({
  jobs,
  loading,
  onClose,
  onSelectJob,
  onDeleteJob,
}: RecentJobsDrawerProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recent-clips-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-xl border border-white/12 bg-[#141821] shadow-2xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <h2 id="recent-clips-title" className="font-display text-base font-semibold text-white">
            Studio Clips
          </h2>
          <div className="w-14" aria-hidden="true" />
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            // Skeleton loaders matching list structure
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex h-[72px] items-center justify-between rounded-lg border border-white/10 bg-[#0D1015] px-4"
                >
                  <div className="space-y-2">
                    <div className="h-3.5 w-40 rounded bg-slate-800" />
                    <div className="h-2.5 w-28 rounded bg-slate-800/70" />
                  </div>
                  <div className="h-8 w-20 rounded-md bg-slate-800" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0D1015] p-8 text-center">
              <Film className="mx-auto h-7 w-7 text-slate-500" />
              <p className="mt-3 text-sm font-medium text-slate-200">No clips edited yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Upload a video from your phone or computer to let the station cut your first clip.
              </p>
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0D1015] p-3.5"
              >
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <p className="truncate text-sm font-medium text-white">{job.originalFilename}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    <span>{job.config.platform}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{job.config.targetDurationSec}s</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span
                      className={
                        job.stage === 'error'
                          ? 'text-red-400'
                          : job.stage === 'ready' || job.stage === 'completed'
                            ? 'text-amber-400'
                            : 'text-cyan-400'
                      }
                    >
                      {job.stageLabel}
                    </span>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteJob(job.id)}
                  aria-label={`Delete ${job.originalFilename}`}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
