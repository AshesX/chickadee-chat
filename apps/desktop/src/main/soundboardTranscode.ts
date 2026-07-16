import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

/** Hard cap on a soundboard clip's length, enforced input-side (see buildTranscodeArgs). */
export const MAX_CLIP_DURATION_S = 5;

/**
 * Build the ffmpeg argv for transcoding an arbitrary local audio file into a
 * soundboard-ready clip: trimmed, loudness-normalized, compressed. Pure and
 * spawn-free so the exact command shape is unit-testable.
 *
 * `-t 5` is an INPUT-side option (before `-i`), so the demuxer never reads
 * past 5s of source — `dynaudnorm` downstream in the same filtergraph
 * physically cannot see audio that will be discarded. Loudness normalization
 * uses single-pass `dynaudnorm` rather than two-pass `loudnorm`: for a ≤5s
 * clip, EBU R128 broadcast-grade accuracy isn't worth a second ffmpeg spawn
 * and stderr-JSON parsing, and dynaudnorm has a built-in peak ceiling so no
 * extra limiter stage is needed. `f=200:g=5` tightens dynaudnorm's default
 * ~15s smoothing window down to something sane for a clip this short.
 * `-progress pipe:1` gives machine-parseable progress on stdout (stderr is
 * reserved for real errors via `-loglevel error`) and doubles as the source
 * of the clip's duration, avoiding a second bundled binary (ffprobe) just to
 * read it back.
 */
export function buildTranscodeArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-t', String(MAX_CLIP_DURATION_S),
    '-i', inputPath,
    '-vn',
    '-af', 'dynaudnorm=f=200:g=5',
    '-ar', '48000',
    '-c:a', 'libvorbis',
    '-b:a', '128k',
    '-progress', 'pipe:1',
    '-nostats',
    outputPath,
  ];
}

export interface TranscodeProgress {
  /** 0..1, clamped, based on out_time_ms against the MAX_CLIP_DURATION_S ceiling. */
  ratio: number;
  outTimeMs: number;
}

export interface TranscodeResult {
  outputPath: string;
  durationMs: number;
}

function parseOutTimeMs(line: string): number | null {
  const match = /^out_time_ms=(\d+)$/.exec(line.trim());
  if (!match) return null;
  // ffmpeg's `-progress` reports out_time_ms in MICROseconds despite the name
  // (a long-standing, documented quirk) — convert to real milliseconds.
  return Number(match[1]) / 1000;
}

/**
 * Spawn ffmpeg to transcode `inputPath` into `outputPath` per
 * `buildTranscodeArgs`. Resolves with the clip's actual duration (read off
 * the last `out_time_ms` progress line) once ffmpeg reports `progress=end`
 * and exits 0; rejects with ffmpeg's stderr text (clean, thanks to
 * `-loglevel error`) on any non-zero exit or spawn failure.
 */
export function transcodeClip(
  inputPath: string,
  outputPath: string,
  onProgress: (progress: TranscodeProgress) => void,
): Promise<TranscodeResult> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg binary not available for this platform/architecture'));
      return;
    }
    const child = spawn(ffmpegPath, buildTranscodeArgs(inputPath, outputPath), { windowsHide: true });

    let lastOutTimeMs = 0;
    let stdoutTail = '';
    let stderrText = '';
    let settled = false;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutTail += chunk;
      const lines = stdoutTail.split('\n');
      stdoutTail = lines.pop() ?? '';
      for (const line of lines) {
        const outTimeMs = parseOutTimeMs(line);
        if (outTimeMs != null) {
          lastOutTimeMs = outTimeMs;
          onProgress({ ratio: Math.min(1, Math.max(0, outTimeMs / (MAX_CLIP_DURATION_S * 1000))), outTimeMs });
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrText += chunk;
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve({ outputPath, durationMs: Math.round(lastOutTimeMs) });
      } else {
        reject(new Error(stderrText.trim() || `ffmpeg exited with code ${code}`));
      }
    });
  });
}
