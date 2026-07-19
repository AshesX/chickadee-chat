import { describe, expect, it } from 'vitest';
import {
  MAX_AVATAR_DATA_URL_LEN,
  MAX_BANNED_USERS,
  MAX_BANNER_DATA_URL_LEN,
  MAX_BATCH_FILES,
  MAX_DISPLAY_NAME_LEN,
  MAX_FILE_NAME_LEN,
  MAX_FILE_SIZE_BYTES,
  MAX_ID_LEN,
  MAX_SOUNDBOARD_CLIP_NAME_LEN,
  MAX_SOUNDBOARD_CLIP_SIZE_BYTES,
  MAX_SOUNDBOARD_CLIPS,
  MAX_SOUNDBOARD_DURATION_MS,
  MAX_SOUNDBOARD_FETCH_HASHES,
  clampString,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeBannedUsers,
  sanitizeBannerDataUrl,
  sanitizeFileOfferFiles,
  sanitizeFileOfferMeta,
  sanitizeSaveFileName,
  sanitizeSoundboardClipMeta,
  sanitizeSoundboardClips,
  sanitizeSoundboardFetchHashes,
  sanitizeSoundboardHash,
  sanitizeSoundboardTriggerSource,
  sanitizeStatus,
  suffixedFileName,
} from './sanitize';

const tinyPng = `data:image/png;base64,${'A'.repeat(64)}`;

describe('sanitizeAvatarDataUrl', () => {
  it('accepts a base64 PNG/JPEG/WebP data URL', () => {
    expect(sanitizeAvatarDataUrl(tinyPng)).toBe(tinyPng);
    expect(sanitizeAvatarDataUrl('data:image/jpeg;base64,AAAA')).not.toBeNull();
    expect(sanitizeAvatarDataUrl('data:image/webp;base64,AAAA')).not.toBeNull();
  });

  it('rejects non-image and script-capable payloads', () => {
    expect(sanitizeAvatarDataUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(sanitizeAvatarDataUrl('data:image/gif;base64,AAAA')).toBeNull();
    expect(sanitizeAvatarDataUrl('data:text/html;base64,AAAA')).toBeNull();
    expect(sanitizeAvatarDataUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeAvatarDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('rejects payloads with non-base64 characters', () => {
    expect(sanitizeAvatarDataUrl('data:image/png;base64,AA<script>')).toBeNull();
  });

  it('rejects over-size payloads and non-strings', () => {
    const huge = `data:image/png;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LEN)}`;
    expect(sanitizeAvatarDataUrl(huge)).toBeNull();
    expect(sanitizeAvatarDataUrl(null)).toBeNull();
    expect(sanitizeAvatarDataUrl(42)).toBeNull();
    expect(sanitizeAvatarDataUrl({})).toBeNull();
  });
});

describe('sanitizeBannerDataUrl', () => {
  it('accepts a valid image data URL and honors the larger banner cap', () => {
    expect(sanitizeBannerDataUrl(tinyPng)).toBe(tinyPng);
    const betweenCaps = `data:image/webp;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LEN + 1024)}`;
    expect(betweenCaps.length).toBeLessThanOrEqual(MAX_BANNER_DATA_URL_LEN);
    expect(sanitizeBannerDataUrl(betweenCaps)).toBe(betweenCaps);
  });

  it('rejects over-cap banners and non-images', () => {
    const huge = `data:image/webp;base64,${'A'.repeat(MAX_BANNER_DATA_URL_LEN)}`;
    expect(sanitizeBannerDataUrl(huge)).toBeNull();
    expect(sanitizeBannerDataUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
  });
});

describe('clampString', () => {
  it('trims and caps strings', () => {
    expect(clampString('  hello  ', 10)).toBe('hello');
    expect(clampString('abcdef', 3)).toBe('abc');
  });

  it('returns "" for non-strings', () => {
    expect(clampString(undefined, 5)).toBe('');
    expect(clampString(123, 5)).toBe('');
    expect(clampString(['x'], 5)).toBe('');
  });
});

describe('sanitizeAccentColor', () => {
  it('passes valid #rrggbb through lowercased', () => {
    expect(sanitizeAccentColor('#A1B2C3')).toBe('#a1b2c3');
    expect(sanitizeAccentColor('#ffffff')).toBe('#ffffff');
  });

  it('maps unset and invalid values to "" (auto color)', () => {
    expect(sanitizeAccentColor('')).toBe('');
    expect(sanitizeAccentColor('#fff')).toBe('');
    expect(sanitizeAccentColor('red')).toBe('');
    expect(sanitizeAccentColor('#a1b2c3; background:url(x)')).toBe('');
    expect(sanitizeAccentColor(null)).toBe('');
  });
});

describe('sanitizeStatus', () => {
  it('passes valid statuses through and defaults everything else to online', () => {
    expect(sanitizeStatus('idle')).toBe('idle');
    expect(sanitizeStatus('dnd')).toBe('dnd');
    expect(sanitizeStatus('online')).toBe('online');
    expect(sanitizeStatus('away')).toBe('online');
    expect(sanitizeStatus(undefined)).toBe('online');
  });
});

describe('sanitizeFileOfferMeta', () => {
  it('passes a normal name + size through', () => {
    expect(sanitizeFileOfferMeta('video.mp4', 2_147_483_648)).toEqual({
      name: 'video.mp4',
      size: 2_147_483_648,
    });
  });

  it('clamps over-long names to MAX_FILE_NAME_LEN', () => {
    const meta = sanitizeFileOfferMeta('a'.repeat(300), 10);
    expect(meta?.name).toHaveLength(MAX_FILE_NAME_LEN);
  });

  it('allows size 0 (empty files are valid transfers)', () => {
    expect(sanitizeFileOfferMeta('empty.txt', 0)).toEqual({ name: 'empty.txt', size: 0 });
  });

  it('rejects empty / non-string names', () => {
    expect(sanitizeFileOfferMeta('', 10)).toBeNull();
    expect(sanitizeFileOfferMeta('   ', 10)).toBeNull();
    expect(sanitizeFileOfferMeta(null, 10)).toBeNull();
    expect(sanitizeFileOfferMeta(42, 10)).toBeNull();
  });

  it('rejects invalid sizes', () => {
    expect(sanitizeFileOfferMeta('a.txt', -1)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', 1.5)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', Number.NaN)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', Number.POSITIVE_INFINITY)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', MAX_FILE_SIZE_BYTES + 1)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', '10' as unknown as number)).toBeNull();
    expect(sanitizeFileOfferMeta('a.txt', undefined)).toBeNull();
  });
});

describe('sanitizeBannedUsers', () => {
  it('passes a normal list through', () => {
    expect(sanitizeBannedUsers([{ userId: 'u1', displayName: 'Alice' }])).toEqual([
      { userId: 'u1', displayName: 'Alice' },
    ]);
  });

  it('returns [] for non-arrays', () => {
    expect(sanitizeBannedUsers(undefined)).toEqual([]);
    expect(sanitizeBannedUsers('u1')).toEqual([]);
    expect(sanitizeBannedUsers({ userId: 'u1' })).toEqual([]);
  });

  it('drops malformed entries and empty userIds, tolerates missing names', () => {
    expect(
      sanitizeBannedUsers([null, 42, {}, { userId: '' }, { userId: '  ' }, { userId: 'u2' }, { userId: 'u3', displayName: 7 }]),
    ).toEqual([
      { userId: 'u2', displayName: '' },
      { userId: 'u3', displayName: '' },
    ]);
  });

  it('clamps over-long ids/names', () => {
    const [entry] = sanitizeBannedUsers([{ userId: 'x'.repeat(500), displayName: 'y'.repeat(500) }]);
    expect(entry!.userId).toHaveLength(MAX_ID_LEN);
    expect(entry!.displayName).toHaveLength(MAX_DISPLAY_NAME_LEN);
  });

  it('de-duplicates by userId (first wins) and caps the list length', () => {
    expect(
      sanitizeBannedUsers([
        { userId: 'u1', displayName: 'first' },
        { userId: 'u1', displayName: 'second' },
      ]),
    ).toEqual([{ userId: 'u1', displayName: 'first' }]);

    const flood = Array.from({ length: MAX_BANNED_USERS + 50 }, (_, i) => ({ userId: `u${i}`, displayName: '' }));
    expect(sanitizeBannedUsers(flood)).toHaveLength(MAX_BANNED_USERS);
  });
});

describe('sanitizeFileOfferFiles', () => {
  const file = (name: string, size: number): { name: string; size: number } => ({ name, size });

  it('passes a valid batch through with names clamped', () => {
    const files = sanitizeFileOfferFiles([file('a.mp4', 100), file('b'.repeat(300), 200)]);
    expect(files).toHaveLength(2);
    expect(files?.[0]).toEqual({ name: 'a.mp4', size: 100 });
    expect(files?.[1].name).toHaveLength(MAX_FILE_NAME_LEN);
  });

  it('rejects non-batches: single entry, empty, over the cap, non-arrays', () => {
    expect(sanitizeFileOfferFiles([file('a.mp4', 1)])).toBeNull();
    expect(sanitizeFileOfferFiles([])).toBeNull();
    const tooMany = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, i) => file(`f${i}`, 1));
    expect(sanitizeFileOfferFiles(tooMany)).toBeNull();
    expect(sanitizeFileOfferFiles(Array.from({ length: MAX_BATCH_FILES }, (_, i) => file(`f${i}`, 1)))).toHaveLength(MAX_BATCH_FILES);
    expect(sanitizeFileOfferFiles('nope')).toBeNull();
    expect(sanitizeFileOfferFiles(undefined)).toBeNull();
  });

  it('rejects the whole batch on any bad entry', () => {
    expect(sanitizeFileOfferFiles([file('a.mp4', 1), file('', 1)])).toBeNull();
    expect(sanitizeFileOfferFiles([file('a.mp4', 1), file('b.mp4', -1)])).toBeNull();
    expect(sanitizeFileOfferFiles([file('a.mp4', 1), null])).toBeNull();
    expect(sanitizeFileOfferFiles([file('a.mp4', 1), 'x'])).toBeNull();
  });

  it('allows zero-byte entries', () => {
    expect(sanitizeFileOfferFiles([file('a', 0), file('b', 0)])).toHaveLength(2);
  });
});

describe('suffixedFileName', () => {
  it('inserts the suffix before the last extension', () => {
    expect(suffixedFileName('clip.mp4', 2)).toBe('clip (2).mp4');
    expect(suffixedFileName('archive.tar.gz', 3)).toBe('archive.tar (3).gz');
  });

  it('appends for extension-less and leading-dot names', () => {
    expect(suffixedFileName('README', 2)).toBe('README (2)');
    expect(suffixedFileName('.env', 2)).toBe('.env (2)');
  });
});

describe('sanitizeSaveFileName', () => {
  it('passes ordinary filenames through untouched', () => {
    expect(sanitizeSaveFileName('My Vacation video.mp4')).toBe('My Vacation video.mp4');
    expect(sanitizeSaveFileName('report-v2_final (1).pdf')).toBe('report-v2_final (1).pdf');
  });

  it('replaces path separators and reserved punctuation', () => {
    expect(sanitizeSaveFileName('..\\..\\evil.exe')).toBe('_.._evil.exe');
    expect(sanitizeSaveFileName('a/b/c.txt')).toBe('a_b_c.txt');
    expect(sanitizeSaveFileName('a?:*.mp4')).toBe('a___.mp4');
    expect(sanitizeSaveFileName('quote"less<file>.txt')).toBe('quote_less_file_.txt');
  });

  it('strips control characters', () => {
    const bell = String.fromCharCode(7);
    expect(sanitizeSaveFileName(`a${bell}b.txt`)).toBe('a_b.txt');
  });

  it('trims leading/trailing dots and spaces', () => {
    expect(sanitizeSaveFileName('...hidden.txt')).toBe('hidden.txt');
    expect(sanitizeSaveFileName('name.txt. . ')).toBe('name.txt');
  });

  it('escapes Windows reserved device names', () => {
    expect(sanitizeSaveFileName('con.txt')).toBe('_con.txt');
    expect(sanitizeSaveFileName('COM1')).toBe('_COM1');
    expect(sanitizeSaveFileName('nul')).toBe('_nul');
    expect(sanitizeSaveFileName('console.txt')).toBe('console.txt');
  });

  it('falls back to "download" when nothing survives', () => {
    expect(sanitizeSaveFileName('')).toBe('download');
    expect(sanitizeSaveFileName('. . .')).toBe('download');
    expect(sanitizeSaveFileName(null)).toBe('download');
  });
});

describe('sanitizeSoundboardHash', () => {
  const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('accepts a lowercase 64-char hex digest', () => {
    expect(sanitizeSoundboardHash(validHash)).toBe(validHash);
  });

  it('rejects wrong length, uppercase, and non-hex characters', () => {
    expect(sanitizeSoundboardHash(validHash.slice(0, 63))).toBeNull();
    expect(sanitizeSoundboardHash(`${validHash}a`)).toBeNull();
    expect(sanitizeSoundboardHash(validHash.toUpperCase())).toBeNull();
    expect(sanitizeSoundboardHash(`${validHash.slice(0, 63)}g`)).toBeNull();
  });

  it('rejects path-traversal-shaped and non-string input', () => {
    expect(sanitizeSoundboardHash('../../etc/passwd')).toBeNull();
    expect(sanitizeSoundboardHash(null)).toBeNull();
    expect(sanitizeSoundboardHash(42)).toBeNull();
    expect(sanitizeSoundboardHash({})).toBeNull();
  });
});

describe('sanitizeSoundboardClipMeta', () => {
  const hash = 'a'.repeat(64);

  it('passes a well-formed entry through', () => {
    expect(sanitizeSoundboardClipMeta({ hash, name: 'Air Horn', durationMs: 2500, sizeBytes: 40_000 })).toEqual({
      hash,
      name: 'Air Horn',
      durationMs: 2500,
      sizeBytes: 40_000,
    });
  });

  it('rejects an invalid hash', () => {
    expect(sanitizeSoundboardClipMeta({ hash: 'not-a-hash', name: 'x', durationMs: 100, sizeBytes: 100 })).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(sanitizeSoundboardClipMeta({ hash, name: '', durationMs: 100, sizeBytes: 100 })).toBeNull();
  });

  it('rejects a negative, non-finite, or over-cap duration', () => {
    expect(sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: -1, sizeBytes: 100 })).toBeNull();
    expect(sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: Infinity, sizeBytes: 100 })).toBeNull();
    expect(
      sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: MAX_SOUNDBOARD_DURATION_MS + 1, sizeBytes: 100 }),
    ).toBeNull();
    expect(
      sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: MAX_SOUNDBOARD_DURATION_MS, sizeBytes: 100 }),
    ).not.toBeNull();
  });

  it('rejects a negative, non-integer, or over-cap size', () => {
    expect(sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: 100, sizeBytes: -1 })).toBeNull();
    expect(sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: 100, sizeBytes: 1.5 })).toBeNull();
    expect(
      sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: 100, sizeBytes: MAX_SOUNDBOARD_CLIP_SIZE_BYTES + 1 }),
    ).toBeNull();
    expect(
      sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: 100, sizeBytes: MAX_SOUNDBOARD_CLIP_SIZE_BYTES }),
    ).not.toBeNull();
  });

  it('clamps an over-long name rather than rejecting', () => {
    const entry = sanitizeSoundboardClipMeta({ hash, name: 'x'.repeat(500), durationMs: 100, sizeBytes: 100 });
    expect(entry!.name).toHaveLength(MAX_SOUNDBOARD_CLIP_NAME_LEN);
  });

  it('rejects non-objects and missing fields', () => {
    expect(sanitizeSoundboardClipMeta(null)).toBeNull();
    expect(sanitizeSoundboardClipMeta('x')).toBeNull();
    expect(sanitizeSoundboardClipMeta({ hash })).toBeNull();
    expect(sanitizeSoundboardClipMeta({ hash, name: 'x', durationMs: 100 })).toBeNull();
  });
});

describe('sanitizeSoundboardClips', () => {
  const hash1 = '1'.repeat(64);
  const hash2 = '2'.repeat(64);

  it('returns [] for non-arrays', () => {
    expect(sanitizeSoundboardClips(undefined)).toEqual([]);
    expect(sanitizeSoundboardClips('x')).toEqual([]);
  });

  it('drops malformed entries and keeps the rest', () => {
    expect(
      sanitizeSoundboardClips([
        { hash: hash1, name: 'A', durationMs: 100, sizeBytes: 100 },
        null,
        { hash: 'bad', name: 'B', durationMs: 100, sizeBytes: 100 },
        { hash: hash2, name: 'C', durationMs: 200, sizeBytes: 200 },
      ]),
    ).toEqual([
      { hash: hash1, name: 'A', durationMs: 100, sizeBytes: 100 },
      { hash: hash2, name: 'C', durationMs: 200, sizeBytes: 200 },
    ]);
  });

  it('de-duplicates by hash (first wins) and caps the list length', () => {
    const deduped = sanitizeSoundboardClips([
      { hash: hash1, name: 'First', durationMs: 100, sizeBytes: 100 },
      { hash: hash1, name: 'Second', durationMs: 200, sizeBytes: 200 },
    ]);
    expect(deduped).toEqual([{ hash: hash1, name: 'First', durationMs: 100, sizeBytes: 100 }]);

    const many = Array.from({ length: MAX_SOUNDBOARD_CLIPS + 10 }, (_, i) => ({
      hash: i.toString().padStart(64, '0'),
      name: `clip-${i}`,
      durationMs: 100,
      sizeBytes: 100,
    }));
    expect(sanitizeSoundboardClips(many)).toHaveLength(MAX_SOUNDBOARD_CLIPS);
  });
});

describe('sanitizeSoundboardFetchHashes', () => {
  const hash1 = '1'.repeat(64);
  const hash2 = '2'.repeat(64);

  it('returns [] for non-arrays', () => {
    expect(sanitizeSoundboardFetchHashes(undefined)).toEqual([]);
    expect(sanitizeSoundboardFetchHashes('x')).toEqual([]);
  });

  it('drops malformed hashes and keeps the rest', () => {
    expect(sanitizeSoundboardFetchHashes([hash1, 'not-a-hash', null, hash2])).toEqual([hash1, hash2]);
  });

  it('de-duplicates and caps the list length', () => {
    expect(sanitizeSoundboardFetchHashes([hash1, hash1])).toEqual([hash1]);

    const many = Array.from({ length: MAX_SOUNDBOARD_FETCH_HASHES + 10 }, (_, i) => i.toString().padStart(64, '0'));
    expect(sanitizeSoundboardFetchHashes(many)).toHaveLength(MAX_SOUNDBOARD_FETCH_HASHES);
  });
});

describe('sanitizeSoundboardTriggerSource', () => {
  it('accepts "preset" and "custom"', () => {
    expect(sanitizeSoundboardTriggerSource('preset')).toBe('preset');
    expect(sanitizeSoundboardTriggerSource('custom')).toBe('custom');
  });

  it('rejects anything else', () => {
    expect(sanitizeSoundboardTriggerSource('other')).toBeNull();
    expect(sanitizeSoundboardTriggerSource('')).toBeNull();
    expect(sanitizeSoundboardTriggerSource(null)).toBeNull();
    expect(sanitizeSoundboardTriggerSource(undefined)).toBeNull();
  });
});
