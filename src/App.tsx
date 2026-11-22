import { useCallback, useEffect, useState } from 'react';
import { CreateEditSheet } from './components/CreateEditSheet';
import { RecentJobsDrawer } from './components/RecentJobsDrawer';
import { ReviewWorkspace } from './components/ReviewWorkspace';
import { StationScene } from './components/station/StationScene';
import { StudioDock } from './components/StudioDock';
import type { VideoJob } from './types/editor';

export default function App() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [activeJob, setActiveJob] = useState<VideoJob | null>(null);
  const [reviewJob, setReviewJob] = useState<VideoJob | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showRecentDrawer, setShowRecentDrawer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chatterEnabled, setChatterEnabled] = useState(true);

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: VideoJob[] };
      setJobs(data.jobs || []);
    } catch {
      // Quietly handle initial list load error
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Subscribe to SSE progress + visibilitychange re-sync for mobile backgrounding
  useEffect(() => {
    const targetId = activeJob?.id || reviewJob?.id;
    if (!targetId) return;

    let es: EventSource | null = new EventSource(`/api/jobs/${targetId}/events`);

    const applyUpdate = (updated: VideoJob) => {
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === updated.id);
        return exists ? prev.map((j) => (j.id === updated.id ? updated : j)) : [updated, ...prev];
      });
      setActiveJob((curr) => (curr && curr.id === updated.id ? updated : curr));
      setReviewJob((curr) => (curr && curr.id === updated.id ? updated : curr));
    };

    es.onmessage = (ev) => {
      try {
        const updated = JSON.parse(ev.data) as VideoJob;
        applyUpdate(updated);
      } catch {
        // Ignore malformed SSE keepalive frames
      }
    };

    const syncNow = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/jobs/${targetId}`);
        if (res.ok) {
          const data = (await res.json()) as { job: VideoJob };
          applyUpdate(data.job);
        }
      } catch {
        // Ignore transient offline errors
      }
    };

    document.addEventListener('visibilitychange', syncNow);

    return () => {
      es?.close();
      es = null;
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, [activeJob?.id, reviewJob?.id]);

  const handleJobCreated = (job: VideoJob) => {
    setShowCreateSheet(false);
    setActiveJob(job);
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    notify('Footage sent to the editing desk.');
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = (await res.json()) as { job?: VideoJob; error?: string };
      if (!res.ok || !data.job) {
        notify(data.error || 'Could not retry clip. Try uploading again.');
        return;
      }
      setActiveJob(data.job);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job! : j)));
      notify('Retrying video analysis at the editing desk.');
    } catch {
      notify('Could not reach server to retry.');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        notify('Could not delete that clip. Try again.');
        return;
      }
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (activeJob?.id === jobId) setActiveJob(null);
      if (reviewJob?.id === jobId) setReviewJob(null);
      notify('Clip removed.');
    } catch {
      notify('Could not delete clip. Check connection.');
    }
  };

  if (reviewJob) {
    return (
      <>
        <ReviewWorkspace
          job={reviewJob}
          onBackToStation={() => {
            setReviewJob(null);
            void fetchJobs();
          }}
          onNotify={notify}
          onJobUpdated={(updated) => {
            setReviewJob(updated);
            setActiveJob(updated);
          }}
        />
        {toast && (
          <div className="fixed right-4 bottom-4 z-50 rounded-lg border border-white/15 bg-[#141821] px-4 py-2.5 text-xs font-medium text-white shadow-xl">
            {toast}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0D1015]">
      {/* Minimal 3-Zone Top Bar */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a
          href="/"
          className="pointer-events-auto font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 sm:text-lg"
        >
          CutCraft Studio
        </a>

        <nav className="pointer-events-auto hidden items-center gap-6 text-sm font-medium text-slate-300 sm:flex">
          <button
            type="button"
            onClick={() => setShowRecentDrawer(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Clips
          </button>
          <button
            type="button"
            onClick={() => setShowCreateSheet(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Upload
          </button>
        </nav>

        <div className="pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateSheet(true)}
            className="min-h-[40px] rounded-lg bg-[#141821]/95 border border-white/15 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-400/60 whitespace-nowrap shrink-0"
          >
            New Edit
          </button>
        </div>
      </header>

      {/* Unobstructed Central 2.5D Station Viewport */}
      <main className="h-full w-full">
        <StationScene
          activeStage={activeJob?.stage || null}
          activeStageLabel={activeJob?.stageLabel}
          chatterEnabled={chatterEnabled}
        />
      </main>

      {/* Collapsible Bottom Control Dock */}
      <StudioDock
        activeJob={activeJob}
        jobCount={jobs.length}
        chatterEnabled={chatterEnabled}
        onToggleChatter={() => {
          setChatterEnabled((v) => {
            const next = !v;
            notify(next ? 'Studio chatter enabled.' : 'Studio chatter muted.');
            return next;
          });
        }}
        onNewEdit={() => setShowCreateSheet(true)}
        onOpenRecent={() => {
          void fetchJobs();
          setShowRecentDrawer(true);
        }}
        onOpenReview={(job) => setReviewJob(job)}
        onRetryJob={handleRetryJob}
        onDismissError={() => setActiveJob(null)}
      />

      {showCreateSheet && (
        <CreateEditSheet
          onClose={() => setShowCreateSheet(false)}
          onJobCreated={handleJobCreated}
        />
      )}

      {showRecentDrawer && (
        <RecentJobsDrawer
          jobs={jobs}
          loading={loadingJobs}
          onClose={() => setShowRecentDrawer(false)}
          onSelectJob={(job) => {
            setShowRecentDrawer(false);
            if (job.stage === 'ready' || job.stage === 'completed') {
              setReviewJob(job);
            } else {
              setActiveJob(job);
            }
          }}
          onDeleteJob={handleDeleteJob}
        />
      )}

      {toast && (
        <div className="fixed top-16 right-4 z-50 rounded-lg border border-white/15 bg-[#141821] px-4 py-2.5 text-xs font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
