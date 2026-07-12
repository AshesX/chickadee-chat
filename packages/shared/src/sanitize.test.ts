import { describe, expect, it } from 'vitest';
import {
  MAX_AVATAR_DATA_URL_LEN,
  MAX_BANNED_USERS,
  MAX_BANNER_DATA_URL_LEN,
  MAX_DISPLAY_NAME_LEN,
  MAX_FILE_NAME_LEN,
  MAX_FILE_SIZE_BYTES,
  MAX_ID_LEN,
  clampString,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeBannedUsers,
  sanitizeBannerDataUrl,
  sanitizeFileOfferMeta,
  sanitizeSaveFileName,
  sanitizeStatus,
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
