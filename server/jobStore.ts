import fs from 'fs';
import path from 'path';
import type { VideoJob } from '../src/types/editor.ts';

export const JOBS_ROOT = '/tmp/cutcraft-jobs';
const JOB_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

fs.mkdirSync(JOBS_ROOT, { recursive: true });

type JobListener = (job: VideoJob) => void;
const listeners = new Map<string, Set<JobListener>>();

export function getJobDir(jobId: string): string {
  return path.join(JOBS_ROOT, jobId);
}

export function getJobJsonPath(jobId: string): string {
  return path.join(getJobDir(jobId), 'job.json');
}

export function saveJob(job: VideoJob): VideoJob {
  const dir = getJobDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const updated: VideoJob = {
    ...job,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getJobJsonPath(job.id), JSON.stringify(updated, null, 2), 'utf8');
  emitJobUpdate(updated);
  return updated;
}

export function updateJob(jobId: string, patch: Partial<VideoJob>): VideoJob | null {
  const current = loadJob(jobId);
  if (!current) return null;
  return saveJob({ ...current, ...patch });
}

export function loadJob(jobId: string): VideoJob | null {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(jobId)) return null;
  const p = getJobJsonPath(jobId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as VideoJob;
  } catch {
    return null;
  }
}

export function listJobs(): VideoJob[] {
  if (!fs.existsSync(JOBS_ROOT)) return [];
  const entries = fs.readdirSync(JOBS_ROOT, { withFileTypes: true });
  const jobs: VideoJob[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const job = loadJob(entry.name);
    if (job) jobs.push(job);
  }
  return jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function subscribeToJob(jobId: string, listener: JobListener): () => void {
  let set = listeners.get(jobId);
  if (!set) {
    set = new Set();
    listeners.set(jobId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(jobId);
  };
}

function emitJobUpdate(job: VideoJob): void {
  const set = listeners.get(job.id);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(job);
    } catch {
      // Ignore closed subscriber errors
    }
  }
}

export function deleteJob(jobId: string): void {
  const dir = getJobDir(jobId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  listeners.delete(jobId);
}

export function pruneExpiredJobs(): void {
  if (!fs.existsSync(JOBS_ROOT)) return;
  const now = Date.now();
  const entries = fs.readdirSync(JOBS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const job = loadJob(entry.name);
    if (!job) {
      const stats = fs.statSync(path.join(JOBS_ROOT, entry.name));
      if (now - stats.mtimeMs > JOB_TTL_MS) {
        fs.rmSync(path.join(JOBS_ROOT, entry.name), { recursive: true, force: true });
      }
      continue;
    }
    const updatedMs = Date.parse(job.updatedAt || job.createdAt);
    if (Number.isFinite(updatedMs) && now - updatedMs > JOB_TTL_MS) {
      deleteJob(entry.name);
    }
  }
}

// Run cleanup periodically so disk space stays bounded
setInterval(pruneExpiredJobs, 30 * 60 * 1000).unref();
