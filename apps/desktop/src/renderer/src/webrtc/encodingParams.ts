/**
 * Pure helpers that turn the user's resolution/framerate/quality settings into
 * concrete RTP sender encoding parameters (video) and Opus targets (audio). No
 * React, no WebRTC objects — plain values in, plain values out — so they're
 * trivially unit-testable (see encodingParams.test.ts), matching the
 * `meshLogic.ts` / `enableOpusDtx` convention.
 *
 * Why this matters: in a full mesh each peer encodes a separate outbound stream
 * to every other peer. Chromium's defaults leave video bitrate effectively
 * uncapped, so a 4-way video room can pin the CPU and saturate the uplink (and
 * inflate TURN-relay egress). Capping bitrate/framerate per sender and picking a
 * sensible degradation strategy is the single biggest client-side performance
 * lever for this app.
 */

import type { AudioQuality, VideoQuality } from '@chickadee/shared';

/** The subset of `RTCRtpEncodingParameters` we set, plus the top-level degradation pref. */
export interface VideoEncoding {
  /** Target ceiling in bits/sec; `undefined` = leave uncapped (Chromium default). */
  maxBitrate?: number;
  /** Frame-rate ceiling (the selected capture fps). */
  maxFramerate: number;
  /** Optional downscale factor applied by the encoder (1 = native). */
  scaleResolutionDownBy?: number;
  /** How the encoder trades resolution vs. framerate under congestion/CPU pressure. */
  degradationPreference: RTCDegradationPreference;
}

/** Opus targets applied via SDP munging (no `setParameters` equivalent for these). */
export interface AudioEncoding {
  /** Opus `maxaveragebitrate` in bits/sec; `undefined` = uncapped. */
  maxAverageBitrate?: number;
  /** Force mono (`stereo=0;sprop-stereo=0`) — right for voice, halves audio bandwidth. */
  mono: boolean;
}

/** Full per-link encoding config (camera + screen video, plus shared audio target). */
export interface MeshEncoding {
  camera: VideoEncoding;
  screen: VideoEncoding;
  audio: AudioEncoding;
}

/**
 * Quality-first base bitrate ceilings (bits/sec) at the `'high'` tier, keyed by
 * resolution. Tuned to preserve sharpness while still cutting well below
 * Chromium's uncapped defaults. Screen runs higher than camera at the same
 * resolution because shared content (text/UI/games) wants detail.
 */
const CAMERA_BASE_BPS: Record<string, number> = {
  '480p': 1_000_000,
  '720p': 2_000_000,
  '1080p': 3_500_000,
  '1440p': 5_000_000,
  '4K': 8_000_000,
};

const SCREEN_BASE_BPS: Record<string, number> = {
  '480p': 1_500_000,
  '720p': 2_500_000,
  '1080p': 4_500_000,
  '1440p': 7_000_000,
  '4K': 12_000_000,
};

/** Multiplier applied to the base ceiling per quality tier (`'max'` = uncapped). */
const QUALITY_MULTIPLIER: Record<Exclude<VideoQuality, 'max'>, number> = {
  high: 1.0,
  balanced: 0.6,
  saver: 0.35,
};

/** Opus `maxaveragebitrate` (bits/sec) per quality tier; `'max'` = uncapped/stereo. */
const AUDIO_BPS: Record<AudioQuality, number | undefined> = {
  max: undefined,
  high: 48_000,
  balanced: 40_000,
  saver: 24_000,
};

/**
 * A video sender's role in the golden-ratio model. Exactly one stream per room is
 * `'stage'` (the spotlighted screen/camera — high quality); every other webcam is a
 * `'thumbnail'` (aggressively compressed, so N thumbnails stay cheap in the mesh).
 */
export type VideoRole = 'stage' | 'thumbnail';

/** Fixed thumbnail ceilings — uniform + tiny regardless of tier, so gallery webcams
 *  never threaten the uplink. The bitrate cap is the hard guarantee; the downscale +
 *  fps cap also cut encode CPU. */
const THUMBNAIL_BPS = 200_000;
const THUMBNAIL_FPS = 15;
const THUMBNAIL_SCALE = 3;

/**
 * Total outbound bitrate (bits/sec) the single stage stream may consume across ALL
 * its subscribers combined. In a full mesh, upload = perViewerBitrate × viewers, so
 * setting perViewerBitrate = budget / viewers bounds total stage upload at ~this
 * budget no matter how many watch (quality degrades gracefully as more subscribe).
 * A hard ceiling even for the `'max'` tier — the mesh-safety lever for 8-user rooms.
 */
export const STAGE_UPLOAD_BUDGET_BPS = 12_000_000;

/**
 * Compute the sender encoding for one video kind at a given resolution/framerate,
 * quality tier, and role. A `'thumbnail'` returns fixed tiny ceilings (bitrate +
 * downscale + low fps) independent of tier — every non-stage webcam is compressed.
 * A `'stage'` returns the tier-based ceiling (`'max'` leaves `maxBitrate` undefined —
 * see `applyUploadBudget`, which still bounds it). Unknown resolutions fall back to
 * the 720p row. Screen prefers `maintain-resolution`; camera prefers `balanced`.
 */
export function computeVideoEncoding(
  kind: 'camera' | 'screen',
  resolution: string,
  framerate: string,
  quality: VideoQuality,
  role: VideoRole = 'stage',
): VideoEncoding {
  if (role === 'thumbnail') {
    return {
      maxBitrate: THUMBNAIL_BPS,
      maxFramerate: THUMBNAIL_FPS,
      scaleResolutionDownBy: THUMBNAIL_SCALE,
      degradationPreference: 'balanced',
    };
  }
  const base = kind === 'camera' ? CAMERA_BASE_BPS : SCREEN_BASE_BPS;
  const baseBps = base[resolution] ?? base['720p'];
  const maxBitrate =
    quality === 'max' ? undefined : Math.round(baseBps * QUALITY_MULTIPLIER[quality]);
  const fps = parseInt(framerate, 10) || 30;
  return {
    maxBitrate,
    maxFramerate: fps,
    degradationPreference: kind === 'screen' ? 'maintain-resolution' : 'balanced',
  };
}

/**
 * Clamp a stage encoding to the per-viewer share of the upload budget:
 * `min(tierCap, floor(budget / viewers))`. The budget applies even to the `'max'`
 * tier (uncapped `maxBitrate`), so total stage upload stays bounded at ~`budget`
 * regardless of how many peers subscribe. `viewers` is floored at 1.
 */
export function applyUploadBudget(
  enc: VideoEncoding,
  viewers: number,
  budget: number = STAGE_UPLOAD_BUDGET_BPS,
): VideoEncoding {
  const perViewer = Math.floor(budget / Math.max(1, viewers));
  const capped = enc.maxBitrate == null ? perViewer : Math.min(enc.maxBitrate, perViewer);
  return { ...enc, maxBitrate: capped };
}

/** Compute the Opus audio target for a quality tier (mono + bitrate cap below `'max'`). */
export function computeAudioEncoding(quality: AudioQuality): AudioEncoding {
  return { maxAverageBitrate: AUDIO_BPS[quality], mono: quality !== 'max' };
}

/**
 * Format a bitrate cap for display: `4_500_000` → `'4.5 Mbps'`, `48_000` →
 * `'48 kbps'`, `undefined` → `'Uncapped'`. Used by the Video settings summary so
 * the quality tier shows the concrete ceilings it produces.
 */
export function formatBitrate(bps?: number): string {
  if (bps == null) return 'Uncapped';
  if (bps >= 1_000_000) {
    const mbps = bps / 1_000_000;
    // Trim a trailing `.0` (e.g. 8.0 → 8) but keep one decimal otherwise.
    return `${Number.isInteger(mbps) ? mbps : mbps.toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1000)} kbps`;
}

/**
 * Build the full mesh encoding config from the current settings + quality tiers,
 * given which of our streams (if any) currently holds the room stage and how many
 * peers are watching it. The spotlighted kind is `'stage'` (tier cap clamped by the
 * upload budget); the other kind, if published, is a compressed `'thumbnail'`. With
 * `stageKind = null` (we don't hold the stage) both camera + screen are thumbnails.
 */
export function computeMeshEncoding(
  cameraResolution: string,
  cameraFramerate: string,
  screenResolution: string,
  screenFramerate: string,
  videoQuality: VideoQuality,
  audioQuality: AudioQuality,
  stageKind: 'screen' | 'camera' | null = null,
  watcherCount = 0,
  budget: number = STAGE_UPLOAD_BUDGET_BPS,
): MeshEncoding {
  const cameraRole: VideoRole = stageKind === 'camera' ? 'stage' : 'thumbnail';
  const screenRole: VideoRole = stageKind === 'screen' ? 'stage' : 'thumbnail';
  let camera = computeVideoEncoding('camera', cameraResolution, cameraFramerate, videoQuality, cameraRole);
  let screen = computeVideoEncoding('screen', screenResolution, screenFramerate, videoQuality, screenRole);
  if (cameraRole === 'stage') camera = applyUploadBudget(camera, watcherCount, budget);
  if (screenRole === 'stage') screen = applyUploadBudget(screen, watcherCount, budget);
  return { camera, screen, audio: computeAudioEncoding(audioQuality) };
}
