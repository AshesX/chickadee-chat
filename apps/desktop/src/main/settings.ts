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

  // Migrate: old settings had a top-level 'rooms' array before Spaces were introduced.
  const legacyRooms = storedObj.rooms;
  delete storedObj.rooms;
  currentSettings = { ...defaultSettings(), ...(storedObj as Partial<PersistedSettings>) };

  if (legacyRooms && Array.isArray(legacyRooms) && legacyRooms.length > 0) {
    const defaultSpaceId = `my-space-${randomUUID().slice(0, 5)}`;
    currentSettings.spaces = [{
      id: defaultSpaceId,
      name: 'My Space',
      rooms: legacyRooms as PersistedSettings['spaces'][number]['rooms'],
    }];
    currentSettings.activeSpaceId = defaultSpaceId;
    persistSettings();
  }

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
