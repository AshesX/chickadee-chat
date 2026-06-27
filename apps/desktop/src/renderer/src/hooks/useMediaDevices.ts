import { useEffect, useState } from 'react';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

interface MediaDevicesState {
  inputs: MediaDeviceOption[];
  outputs: MediaDeviceOption[];
  videoInputs: MediaDeviceOption[];
  /** False until the first successful enumerateDevices() resolves. Lets callers
   * tell "not yet scanned" from "scanned and genuinely empty". */
  scanned: boolean;
}

/**
 * Enumerates audio/video input/output devices and refreshes on hot-plug
 * (`devicechange`). Labels are only populated once mic permission is granted —
 * the caller should have acquired the mic (Settings does via prepareMedia)
 * before relying on readable labels.
 */
export function useMediaDevices(enabled: boolean): MediaDevicesState {
  const [state, setState] = useState<MediaDevicesState>({ inputs: [], outputs: [], videoInputs: [], scanned: false });

  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.enumerateDevices) return;

    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const inputs: MediaDeviceOption[] = [];
        const outputs: MediaDeviceOption[] = [];
        const videoInputs: MediaDeviceOption[] = [];
        for (const d of devices) {
          if (d.kind === 'audioinput') {
            inputs.push({ deviceId: d.deviceId, label: d.label || `Microphone ${inputs.length + 1}` });
          } else if (d.kind === 'audiooutput') {
            outputs.push({ deviceId: d.deviceId, label: d.label || `Speaker ${outputs.length + 1}` });
          } else if (d.kind === 'videoinput') {
            videoInputs.push({ deviceId: d.deviceId, label: d.label || `Camera ${videoInputs.length + 1}` });
          }
        }
        setState({ inputs, outputs, videoInputs, scanned: true });
      } catch {
        /* ignore — keep last known list */
      }
    };

    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, [enabled]);

  return state;
}
