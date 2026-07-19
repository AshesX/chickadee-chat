/**
 * OS notifications for file-transfer events (auto-accepted starts; offers
 * arriving while the window is unfocused). Main grants the 'notifications'
 * permission (GRANTED_PERMISSIONS) and sets the Windows AppUserModelID, so
 * packaged builds render native toasts. Failure is always a silent no-op —
 * the transfer tray / modal remain the in-app cue.
 */
export function notifyTransfer(title: string, body: string): void {
  try {
    new Notification(title, { body });
  } catch {
    // Notification API unavailable or blocked — nothing to do.
  }
}
