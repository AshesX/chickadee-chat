import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { defaultSettings, type PersistedSettings } from '@chickadee/shared';

let currentSettings: PersistedSettings = defaultSettings();

export function getSettings(): PersistedSettings {
  return currentSettings;
}

export function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): void {
  let rawStored: unknown = {};
  try {
    const path = settingsPath();
    if (existsSync(path)) rawStored = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error('failed to read settings.json', err);
  }

  if (typeof rawStored !== 'object' || rawStored === null) rawStored = {};
  const storedObj = rawStored as Record<string, unknown>;

  currentSettings = { ...defaultSettings(), ...(storedObj as Partial<PersistedSettings>) };

  if (!currentSettings.userId) {
    currentSettings.userId = randomUUID();
    persistSettings();
  }
}

export function persistSettings(): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(currentSettings, null, 2));
  } catch (err) {
    console.error('failed to write settings.json', err);
  }
}

export function saveSettings(partial: Partial<PersistedSettings>): void {
  currentSettings = { ...currentSettings, ...partial };
  persistSettings();
}
