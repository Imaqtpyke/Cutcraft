import type { JobStage } from '../../types/editor';

export type StudioZone =
  | 'desk'
  | 'lounge'
  | 'storyboard'
  | 'coffee'
  | 'arcade'
  | 'center'
  | 'cat';

export const IDLE_CHATTER: Record<StudioZone, string[]> = {
  lounge: [
    'Taking five in the lounge. Drop a raw clip whenever you are ready.',
    'Strong speech audio beats fancy transitions every single time.',
    'Zero API usage while I hang out here. Tap New Edit anytime.',
    'Resting the eyes. Most viral shorts win or lose in the first 2.5 seconds.',
  ],
  coffee: [
    'Pulling a fresh espresso shot before the next timeline render.',
    'Caffeine check complete. Ready to slice gaming, vlogs, or talking-head clips.',
    'Sipping coffee on standby. Zero quota spent while the machine runs.',
    'Nothing beats a clean roast and -14 LUFS audio normalization.',
  ],
  arcade: [
    'Chasing the high score between renders. Drop footage anytime to pull me back to work.',
    'Quick arcade round! Gaming highlights work great with split-screen framing.',
    'Testing reflexes on the cabinet. Tap New Edit whenever you want me on the desk.',
    'Retro pixels warmed up. Ready for 9:16, 1:1, or 16:9 exports.',
  ],
  storyboard: [
    'Reviewing framing guides: keep captions clear of the bottom 25% TikTok UI.',
    'Cutting dead air between sentences raises mobile completion rates fast.',
    'Subtle 1.1x zoom punches on key words reset viewer attention cleanly.',
    'Vlogs breathe better with warm color contrast and clean cross-dissolves.',
  ],
  desk: [
    'Editing deck calibrated for 9:16, 1:1, and 16:9 exports.',
    'Monitors on standby. Tap New Edit below to send footage to the desk.',
    'Tap the coffee machine, arcade cabinet, or cat in the room anytime.',
  ],
  center: [
    'Pacing the studio floor. Any raw footage up to 6 minutes works great.',
    'Looking for a clip to slice into a tight 15s, 30s, or 60s cut.',
    'I handle cropping, karaoke captions, color presets, and post copy together.',
  ],
  cat: [
    'Giving Pixel the studio cat a quick chin scratch.',
    'Pixel approves of the 9:16 framing. Good kitty.',
    'Best co-editor in the studio. Never complains about render times.',
    'Taking a quick pet break with Pixel before the next clip.',
  ],
};

export const CAT_CHATTER = {
  nap: ['Zzz... curling up on the rug.', 'Purr... warm rug nap.', 'Snoozing by the sofa.'],
  arcade: ['Watching the bright arcade pixels.', 'Chasing the bouncing pixel ball.'],
  coffee: ['Sniffing the espresso aroma.', 'Curious about the coffee steam.'],
  greetPerson: ['Meow! *head boop*', 'Purr... *rubs against leg*', 'Mrrp! Wants a pet.'],
  petted: ['Purrrr... *happy tail wag*', 'Mew! *leans into chin scratch*'],
  watchWork: ['Supervising the render from the floor.', 'Purr... keeping the editor company.'],
  stretch: ['Big studio floor stretch.', 'Patrolling the room for stray cables.'],
};

export function getWorkingChatter(stage: JobStage): string {
  switch (stage) {
    case 'queued':
      return 'Footage received. Heading to the editing desk now.';
    case 'ingesting':
      return 'Inspecting resolution, rotation, and silence intervals.';
    case 'transcribing':
      return 'Listening to speech and marking audio boundaries.';
    case 'researching':
      return 'Researching niche pacing and platform trends with Gemini 4 Hydrogen.';
    case 'directing':
      return 'Writing the Edit Script, crop keyframes, and caption blocks.';
    case 'rendering_draft':
      return 'Compiling the draft MP4 with animated captions and safe zones.';
    case 'exporting_hd':
      return 'Mastering full 1080p HD cut and normalizing audio levels.';
    case 'ready':
      return 'Draft preview is ready. Check the safe zones or tweak anything.';
    case 'completed':
      return '1080p HD export wrapped and ready to save to your phone.';
    case 'error':
      return 'Hit a snag on that render. Check the message and retry anytime.';
    default:
      return 'At the station.';
  }
}
