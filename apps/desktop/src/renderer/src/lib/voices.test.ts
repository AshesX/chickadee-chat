import { describe, it, expect, afterEach, vi } from 'vitest';

// resolveVoice reads window.speechSynthesis.getVoices() through a module-level
// cache, so each scenario stubs the global and re-imports a fresh module.
function stubVoices(list: Array<{ name: string; lang: string }>): void {
  (globalThis as { window?: unknown }).window = {
    speechSynthesis: {
      getVoices: () => list,
      addEventListener: () => {},
    },
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.resetModules();
});

describe('pitchForCategory', () => {
  it('shifts pitch down for male, up for female categories', async () => {
    const { pitchForCategory } = await import('./voices');
    expect(pitchForCategory('us-male')).toBe(0.85);
    expect(pitchForCategory('us-female')).toBe(1.15);
  });

  it('returns neutral pitch for empty / unknown ids', async () => {
    const { pitchForCategory } = await import('./voices');
    expect(pitchForCategory('')).toBe(1);
    expect(pitchForCategory('not-a-category')).toBe(1);
  });
});

describe('resolveVoice', () => {
  const VOICES = [
    { name: 'Microsoft Zira', lang: 'en-US' },
    { name: 'Microsoft David', lang: 'en-US' },
    { name: 'Google UK English Male', lang: 'en-GB' },
  ];

  it('matches language then gender by name heuristic', async () => {
    stubVoices(VOICES);
    const { resolveVoice, initVoices } = await import('./voices');
    initVoices();
    expect(resolveVoice('us-female')?.name).toBe('Microsoft Zira');
    expect(resolveVoice('us-male')?.name).toBe('Microsoft David');
    expect(resolveVoice('uk-male')?.name).toBe('Google UK English Male');
  });

  it('returns undefined for empty / unknown ids', async () => {
    stubVoices(VOICES);
    const { resolveVoice } = await import('./voices');
    expect(resolveVoice('')).toBeUndefined();
    expect(resolveVoice('not-a-category')).toBeUndefined();
  });

  it('returns undefined when no voices are installed', async () => {
    stubVoices([]);
    const { resolveVoice } = await import('./voices');
    expect(resolveVoice('us-female')).toBeUndefined();
  });
});
