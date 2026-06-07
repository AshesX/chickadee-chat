import { useEffect } from 'react';
import { generateTrayIcon } from '../lib/trayIcon';

interface UseSyncOpts {
  currentRoomLabel: string | null;
  handleToggleMic: () => void;
  toggleDeafen: () => void;
}

export function useTraySync({ currentRoomLabel, handleToggleMic, toggleDeafen }: UseSyncOpts): void {
  useEffect(() => {
    void generateTrayIcon().then((url) => {
      if (url) window.chickadee?.setTrayIcon?.(url);
    });
  }, []);

  useEffect(() => {
    window.chickadee?.setTrayRoom?.(currentRoomLabel);
  }, [currentRoomLabel]);

  useEffect(() => {
    return window.chickadee?.onTrayMute?.(() => handleToggleMic());
  }, [handleToggleMic]);

  useEffect(() => {
    return window.chickadee?.onTrayDeafen?.(() => toggleDeafen());
  }, [toggleDeafen]);
}
