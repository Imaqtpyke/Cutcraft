export type PlatformTarget = 'tiktok' | 'shorts' | 'reels' | 'square' | 'landscape';

export type ContentStyleMode = 'auto' | 'talking_head' | 'gaming' | 'vlog_cinematic';

export type CaptionStyle = 'karaoke_bold' | 'pop_clean' | 'minimal_bottom' | 'none';

export type CaptionFont = 'liberation_sans' | 'jetbrains_mono' | 'dejavu_sans';

export type CropFocusMode = 'auto' | 'center' | 'left' | 'right' | 'gaming_split';

export type EditIntensity = 'minimal' | 'balanced' | 'high_energy';

export type ColorGradePreset = 'natural' | 'studio_crisp' | 'cinematic_warm' | 'high_contrast';

export type FilmLook = 'clean' | 'cinematic_vignette' | 'film_16mm';

export type CameraMotion = 'static' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right';

export type TransitionType =
  | 'cut'
  | 'smoothleft'
  | 'wipeleft'
  | 'slideup'
  | 'fadewhite'
  | 'dissolve'
  | 'circleopen'
  | 'flash';

export type MotionGraphicType = 'hook_card' | 'lower_third' | 'stat_callout' | 'keyword_badge';

export interface MotionGraphicItem {
  id: string;
  type: MotionGraphicType;
  startSec: number;
  endSec: number;
  title: string;
  subtitle?: string;
  accentColor?: 'amber' | 'cyan' | 'white';
}

export type JobStage =
  | 'queued'
  | 'ingesting'
  | 'transcribing'
  | 'researching'
  | 'directing'
  | 'rendering_draft'
  | 'ready'
  | 'exporting_hd'
  | 'completed'
  | 'error';

export interface CutSegment {
  id: string;
  startSec: number;
  endSec: number;
  reason: string;
  zoomPunch: number;
  cameraMotion: CameraMotion;
  cropX: number;
  speed: number;
  transitionIn: TransitionType;
}

export interface CaptionPhrase {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  emphasisWord?: string;
}

export interface ResearchSource {
  title: string;
  uri: string;
}

export interface EditScript {
  detectedCategory: 'talking_head' | 'gaming' | 'vlog_cinematic';
  hookTitle: string;
  directorSummary: string;
  researchInsights: string[];
  researchSources: ResearchSource[];
  targetDurationSec: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  cropFocus: CropFocusMode;
  captionStyle: CaptionStyle;
  captionFont: CaptionFont;
  colorPreset: ColorGradePreset;
  filmLook: FilmLook;
  editIntensity: EditIntensity;
  showProgressBar: boolean;
  motionGraphicsEnabled: boolean;
  audioNormalize: boolean;
  sfxEnabled: boolean;
  segments: CutSegment[];
  captions: CaptionPhrase[];
  motionGraphics: MotionGraphicItem[];
  socialCopy: {
    title: string;
    description: string;
    hashtags: string[];
  };
}

export interface MediaInfo {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  hasAudio: boolean;
  rotation: number;
}

export interface SilenceInterval {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface TranscriptPhrase {
  startSec: number;
  endSec: number;
  text: string;
}

export interface JobConfig {
  platform: PlatformTarget;
  targetDurationSec: number;
  styleMode: ContentStyleMode;
  customPrompt?: string;
}

export interface VideoJob {
  id: string;
  originalFilename: string;
  createdAt: string;
  updatedAt: string;
  stage: JobStage;
  progress: number;
  stageLabel: string;
  errorMessage?: string;
  config: JobConfig;
  mediaInfo?: MediaInfo;
  transcript?: TranscriptPhrase[];
  editScript?: EditScript;
  draftVideoUrl?: string;
  hdVideoUrl?: string;
}
