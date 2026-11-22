import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  runAiDirector,
  tweakEditScriptWithAi,
} from './server/geminiDirector.ts';
import {
  deleteJob,
  getJobDir,
  listJobs,
  loadJob,
  saveJob,
  subscribeToJob,
  updateJob,
} from './server/jobStore.ts';
import {
  inspectMedia,
  prepareAnalysisAssets,
  renderEditScript,
} from './server/mediaPipeline.ts';
import type {
  ContentStyleMode,
  EditScript,
  PlatformTarget,
  VideoJob,
} from './src/types/editor.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const jobId = (req as express.Request & { jobId?: string }).jobId!;
    const dir = getJobDir(jobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4').toLowerCase() || '.mp4';
    const safeExt = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'].includes(ext) ? ext : '.mp4';
    cb(null, `source${safeExt}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 250 * 1024 * 1024 },
});

function generateJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toFriendlyErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/API_KEY_INVALID|PERMISSION_DENIED|GEMINI_API_KEY|\b401\b|\b403\b/i.test(msg)) {
    return 'Gemini API key is missing or invalid. Please check your key in Settings > Secrets.';
  }
  if (/RESOURCE_EXHAUSTED|\b429\b/i.test(msg)) {
    return 'Gemini API quota reached for this key. Wait a moment to retry, or select a billing-enabled key in Settings > Secrets.';
  }
  if (/NOT_FOUND|\b404\b/i.test(msg)) {
    return 'Requested Gemini model endpoint was unavailable. Please retry in a moment.';
  }
  if (/INVALID_ARGUMENT|\b400\b/i.test(msg)) {
    return 'This clip could not be analyzed in its current encoding. Try a shorter segment or MP4 clip.';
  }
  if (/ETIMEDOUT|ECONNRESET|fetch failed|timeout/i.test(msg)) {
    return 'Connection to the AI director timed out. Please retry in a moment.';
  }
  if (/ffmpeg exited/i.test(msg)) {
    return 'The video encoder hit an unexpected frame format. Try a shorter clip or standard MP4.';
  }
  if (/Clip exceeds V1 6-minute/i.test(msg)) {
    return 'This clip is longer than 6 minutes. Please trim it under 6 minutes for V1.';
  }
  if (/No video stream/i.test(msg)) {
    return 'The uploaded file does not contain a readable video track. Try an MP4 or MOV clip.';
  }
  return 'Something interrupted video processing. Please retry with this clip or a shorter segment.';
}

function findSourcePath(jobDir: string): string | null {
  if (!fs.existsSync(jobDir)) return null;
  const match = fs.readdirSync(jobDir).find((f) => f.startsWith('source.'));
  return match ? path.join(jobDir, match) : null;
}

async function runFullJobPipeline(jobId: string): Promise<void> {
  const job = loadJob(jobId);
  if (!job) return;
  const workDir = getJobDir(jobId);
  const sourcePath = findSourcePath(workDir);
  if (!sourcePath) {
    updateJob(jobId, {
      stage: 'error',
      progress: 0,
      stageLabel: 'Source video missing',
      errorMessage: 'The uploaded video file could not be found on disk.',
    });
    return;
  }

  try {
    updateJob(jobId, {
      stage: 'ingesting',
      progress: 12,
      stageLabel: 'Inspecting clip and preparing audio',
    });

    const mediaInfo = await inspectMedia(sourcePath);
    if (mediaInfo.durationSec > 360) {
      throw new Error('Clip exceeds V1 6-minute limit.');
    }

    const { proxyPath, audioPath, silenceIntervals } = await prepareAnalysisAssets(
      sourcePath,
      workDir,
      mediaInfo,
    );

    updateJob(jobId, {
      mediaInfo,
      stage: 'researching',
      progress: 34,
      stageLabel: 'Analyzing video and researching platform pacing',
    });

    const { editScript, transcriptPhrases } = await runAiDirector({
      proxyPath,
      mediaInfo,
      silenceIntervals,
      config: job.config,
      onPhase: (phase) => {
        if (phase === 'directing') {
          updateJob(jobId, {
            stage: 'directing',
            progress: 62,
            stageLabel: 'Directing transitions, camera motion, and overlays',
          });
        }
      },
    });

    updateJob(jobId, {
      transcript: transcriptPhrases,
      editScript,
      stage: 'rendering_draft',
      progress: 82,
      stageLabel: 'Compiling draft preview with transitions and motion graphics',
    });

    const draftPath = path.join(workDir, 'draft.mp4');
    await renderEditScript({
      sourcePath,
      workDir,
      mediaInfo,
      editScript,
      outputPath: draftPath,
      quality: 'draft',
    });

    // Clean up temporary proxy/audio files immediately after analysis
    if (fs.existsSync(proxyPath)) fs.rmSync(proxyPath, { force: true });
    if (audioPath && fs.existsSync(audioPath)) fs.rmSync(audioPath, { force: true });

    updateJob(jobId, {
      stage: 'ready',
      progress: 100,
      stageLabel: 'Draft ready for preview',
      draftVideoUrl: `/api/jobs/${jobId}/video/draft?t=${Date.now()}`,
    });
  } catch (err) {
    console.error(`[job ${jobId}] pipeline failure:`, err);
    try {
      const detail = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ''}` : String(err);
      fs.writeFileSync(path.join(workDir, 'error.log'), `[${new Date().toISOString()}] ${detail}\n`, 'utf8');
    } catch {
      // Ignore error log write failure
    }
    updateJob(jobId, {
      stage: 'error',
      progress: 0,
      stageLabel: 'Processing failed',
      errorMessage: toFriendlyErrorMessage(err),
    });
  }
}

async function runRenderOnly(jobId: string, quality: 'draft' | 'hd'): Promise<void> {
  const job = loadJob(jobId);
  if (!job || !job.editScript || !job.mediaInfo) return;
  const workDir = getJobDir(jobId);
  const sourcePath = findSourcePath(workDir);
  if (!sourcePath) {
    updateJob(jobId, {
      stage: 'error',
      stageLabel: 'Source video missing',
      errorMessage: 'Original video file expired. Please upload the clip again.',
    });
    return;
  }

  try {
    updateJob(jobId, {
      stage: quality === 'hd' ? 'exporting_hd' : 'rendering_draft',
      progress: quality === 'hd' ? 60 : 75,
      stageLabel:
        quality === 'hd'
          ? 'Mastering 1080p HD export with normalized audio'
          : 'Re-rendering preview with your updated controls',
      errorMessage: undefined,
    });

    const outPath = path.join(workDir, quality === 'hd' ? 'export_hd.mp4' : 'draft.mp4');
    await renderEditScript({
      sourcePath,
      workDir,
      mediaInfo: job.mediaInfo,
      editScript: job.editScript,
      outputPath: outPath,
      quality,
    });

    if (quality === 'hd') {
      updateJob(jobId, {
        stage: 'completed',
        progress: 100,
        stageLabel: 'HD export ready to save',
        hdVideoUrl: `/api/jobs/${jobId}/video/hd?t=${Date.now()}`,
      });
    } else {
      updateJob(jobId, {
        stage: 'ready',
        progress: 100,
        stageLabel: 'Updated preview ready',
        draftVideoUrl: `/api/jobs/${jobId}/video/draft?t=${Date.now()}`,
        hdVideoUrl: undefined,
      });
    }
  } catch (err) {
    console.error(`[job ${jobId}] render failure (${quality}):`, err);
    updateJob(jobId, {
      stage: 'error',
      progress: 0,
      stageLabel: 'Render failed',
      errorMessage: toFriendlyErrorMessage(err),
    });
  }
}

async function main() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/jobs', (_req, res) => {
    const jobs = listJobs().slice(0, 12);
    res.json({ jobs });
  });

  app.get('/api/jobs/:jobId', (req, res) => {
    const job = loadJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Edit job not found.' });
      return;
    }
    res.json({ job });
  });

  app.get('/api/jobs/:jobId/events', (req, res) => {
    const { jobId } = req.params;
    const current = loadJob(jobId);
    if (!current) {
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify(current)}\n\n`);

    const unsubscribe = subscribeToJob(jobId, (updated) => {
      res.write(`data: ${JSON.stringify(updated)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post(
    '/api/jobs',
    (req, _res, next) => {
      (req as express.Request & { jobId?: string }).jobId = generateJobId();
      next();
    },
    upload.single('video'),
    (req, res) => {
      const jobId = (req as express.Request & { jobId?: string }).jobId!;
      if (!req.file) {
        res.status(400).json({ error: 'Please select a video file to edit.' });
        return;
      }

      const platform = (req.body?.platform || 'tiktok') as PlatformTarget;
      const styleMode = (req.body?.styleMode || 'auto') as ContentStyleMode;
      const targetDurationSec = Math.min(
        90,
        Math.max(10, Number(req.body?.targetDurationSec) || 30),
      );
      const customPrompt =
        typeof req.body?.customPrompt === 'string' ? req.body.customPrompt.trim().slice(0, 400) : '';

      const newJob: VideoJob = {
        id: jobId,
        originalFilename: req.file.originalname || 'clip.mp4',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stage: 'queued',
        progress: 5,
        stageLabel: 'Video uploaded. Starting studio pipeline',
        config: {
          platform,
          targetDurationSec,
          styleMode,
          customPrompt,
        },
      };

      saveJob(newJob);
      res.status(202).json({ job: newJob });

      void runFullJobPipeline(jobId);
    },
  );

  app.post('/api/jobs/:jobId/retry', (req, res) => {
    const job = loadJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Edit job not found.' });
      return;
    }
    const sourcePath = findSourcePath(getJobDir(job.id));
    if (!sourcePath) {
      res.status(404).json({ error: 'Original uploaded clip is no longer on disk.' });
      return;
    }
    const reset = updateJob(job.id, {
      stage: 'queued',
      progress: 5,
      stageLabel: 'Retrying studio pipeline',
      errorMessage: undefined,
    });
    res.status(202).json({ job: reset });
    void runFullJobPipeline(job.id);
  });

  app.post('/api/jobs/:jobId/rerender', (req, res) => {
    const job = loadJob(req.params.jobId);
    if (!job || !job.editScript) {
      res.status(404).json({ error: 'Edit job or script not found.' });
      return;
    }

    const patch = req.body as Partial<EditScript>;
    const updatedScript: EditScript = {
      ...job.editScript,
      hookTitle: typeof patch.hookTitle === 'string' ? patch.hookTitle.slice(0, 70) : job.editScript.hookTitle,
      captionStyle: patch.captionStyle || job.editScript.captionStyle,
      captionFont: patch.captionFont || job.editScript.captionFont || 'liberation_sans',
      cropFocus: patch.cropFocus || job.editScript.cropFocus,
      colorPreset: patch.colorPreset || job.editScript.colorPreset,
      filmLook: patch.filmLook || job.editScript.filmLook || 'clean',
      editIntensity: patch.editIntensity || job.editScript.editIntensity,
      showProgressBar:
        typeof patch.showProgressBar === 'boolean'
          ? patch.showProgressBar
          : job.editScript.showProgressBar ?? true,
      motionGraphicsEnabled:
        typeof patch.motionGraphicsEnabled === 'boolean'
          ? patch.motionGraphicsEnabled
          : job.editScript.motionGraphicsEnabled ?? true,
      audioNormalize:
        typeof patch.audioNormalize === 'boolean' ? patch.audioNormalize : job.editScript.audioNormalize,
      sfxEnabled: typeof patch.sfxEnabled === 'boolean' ? patch.sfxEnabled : job.editScript.sfxEnabled,
      segments:
        Array.isArray(patch.segments) && patch.segments.length > 0
          ? patch.segments
          : job.editScript.segments,
      captions: Array.isArray(patch.captions) ? patch.captions : job.editScript.captions,
      motionGraphics: Array.isArray(patch.motionGraphics)
        ? patch.motionGraphics.slice(0, 6)
        : job.editScript.motionGraphics || [],
    };

    const saved = updateJob(job.id, { editScript: updatedScript });
    res.status(202).json({ job: saved });
    void runRenderOnly(job.id, 'draft');
  });

  app.post('/api/jobs/:jobId/tweak', async (req, res) => {
    const job = loadJob(req.params.jobId);
    if (!job || !job.editScript || !job.mediaInfo) {
      res.status(404).json({ error: 'Edit job not found.' });
      return;
    }

    const instruction =
      typeof req.body?.instruction === 'string' ? req.body.instruction.trim().slice(0, 300) : '';
    if (!instruction) {
      res.status(400).json({ error: 'Enter a short instruction describing the change you want.' });
      return;
    }

    res.status(202).json({
      job: updateJob(job.id, {
        stage: 'directing',
        progress: 40,
        stageLabel: 'Updating Edit Script with Gemini 4 Hydrogen',
      }),
    });

    try {
      const updatedScript = await tweakEditScriptWithAi({
        currentScript: job.editScript,
        mediaInfo: job.mediaInfo,
        transcript: job.transcript || [],
        config: job.config,
        instruction,
      });
      updateJob(job.id, { editScript: updatedScript });
      await runRenderOnly(job.id, 'draft');
    } catch (err) {
      console.error(`[job ${job.id}] tweak error:`, err);
      updateJob(job.id, {
        stage: 'error',
        progress: 0,
        stageLabel: 'Unable to apply tweak',
        errorMessage: toFriendlyErrorMessage(err),
      });
    }
  });

  app.post('/api/jobs/:jobId/export', (req, res) => {
    const job = loadJob(req.params.jobId);
    if (!job || !job.editScript) {
      res.status(404).json({ error: 'Edit job not found.' });
      return;
    }
    res.status(202).json({
      job: updateJob(job.id, {
        stage: 'exporting_hd',
        progress: 25,
        stageLabel: 'Starting 1080p HD export',
      }),
    });
    void runRenderOnly(job.id, 'hd');
  });

  app.delete('/api/jobs/:jobId', (req, res) => {
    deleteJob(req.params.jobId);
    res.json({ ok: true });
  });

  app.get('/api/jobs/:jobId/video/:kind', (req, res) => {
    const { jobId, kind } = req.params;
    const job = loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    const filename = kind === 'hd' ? 'export_hd.mp4' : 'draft.mp4';
    const filePath = path.join(getJobDir(jobId), filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Rendered video is not ready yet.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const isDownload = req.query.download === '1';

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    if (isDownload) {
      const base = path.parse(job.originalFilename || 'edit').name.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${base}_${job.config.platform}_${kind}.mp4"`,
      );
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  });

  // Upload error handling middleware
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Video exceeds the 250 MB V1 limit. Try trimming or compressing first.' });
        return;
      }
      res.status(400).json({ error: 'Video upload failed. Please try selecting the file again.' });
      return;
    }
    next(err);
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CutCraft Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void main();
