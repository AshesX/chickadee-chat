export function getAppVersion(): string {
  return window.chickadee?.appVersion || '0.4.0';
}
