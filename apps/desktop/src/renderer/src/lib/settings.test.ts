// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

// The store reads window.chickadee at module load, so stub the bridge (the real
// production path — jsdom's localStorage is unusable here anyway) BEFORE the
// dynamic import. The bridge snapshot deliberately omits most keys to exercise
// the schema-default fallbacks (there are no read-time migrations — stale
// schemas are handled by the main process's version-gated wipe).
let store: typeof import('./settings').store;
const saveSettings = vi.fn();

beforeAll(async () => {
  window.chickadee = {
    settings: { userId: 'u-test', inputMode: 'ptt', micVolume: 1.5 },
    saveSettings,
  } as unknown as typeof window.chickadee;
  ({ store } = await import('./settings'));
});

describe('settings store (bridge path)', () => {
  it('falls back to schema defaults for keys missing from an old settings file', () => {
    expect(store.getSfxVolume()).toBe(0.25);
    expect(store.getCloseBehavior()).toBe('quit');
    expect(store.getUploadBudgetMbps()).toBe(12);
    expect(store.getAvatarDataUrl()).toBeNull();
    expect(store.getActiveSpaceId()).toBeNull();
  });

  it('reads the persisted userId', () => {
    expect(store.getUserId()).toBe('u-test');
  });

  it('returns persisted values as-is (no read-time migration)', () => {
    expect(store.getInputMode()).toBe('ptt');
    expect(store.getMicVolume()).toBe(1.5);
    expect(store.getTheme()).toBe('dark'); // omitted key → schema default
  });

  it('roundtrips writes through the factory accessors and saves over IPC', () => {
    store.setChatVisible(true);
    expect(store.getChatVisible()).toBe(true);
    expect(saveSettings).toHaveBeenCalledWith({ chatVisible: true });

    store.setPeerVolume('u1', 1.5);
    expect(store.getPeerVolumes()).toEqual({ u1: 1.5 });
    expect(saveSettings).toHaveBeenCalledWith({ peerVolumes: { u1: 1.5 } });

    store.setPeerScreenVolume('u1', 0.5);
    expect(store.getPeerScreenVolumes()).toEqual({ u1: 0.5 });
    expect(saveSettings).toHaveBeenCalledWith({ peerScreenVolumes: { u1: 0.5 } });
  });

  it('derives rooms from the active space', () => {
    store.setSpaces([
      { id: 's1', name: 'S', rooms: [{ id: 'r', label: 'R', icon: 'i', type: 'hybrid' }] },
    ]);
    store.setActiveSpaceId('s1');
    expect(store.getRooms()).toEqual([{ id: 'r', label: 'R', icon: 'i', type: 'hybrid' }]);
    store.setActiveSpaceId(null);
    expect(store.getRooms()).toEqual([]);
  });
});
