import { describe, expect, it } from 'vitest';
import {
  MAX_AVATAR_DATA_URL_LEN,
  MAX_BANNER_DATA_URL_LEN,
  clampString,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeBannerDataUrl,
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
