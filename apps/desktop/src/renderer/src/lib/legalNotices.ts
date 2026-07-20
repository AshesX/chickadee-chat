export interface LegalNotice {
  name: string;
  license: string;
  licenseUrl: string;
  note?: string;
  sourceUrl?: string;
}

export const LEGAL_NOTICES: LegalNotice[] = [
  {
    name: 'Electron',
    license: 'MIT',
    licenseUrl: 'https://github.com/electron/electron/blob/main/LICENSE',
    note: 'Bundles Chromium, Node.js, and V8; their full third-party notices are included with the installed application as LICENSES.chromium.html.',
  },
  {
    name: 'React & React DOM',
    license: 'MIT',
    licenseUrl: 'https://github.com/facebook/react/blob/main/LICENSE',
  },
  {
    name: 'lucide-react',
    license: 'ISC',
    licenseUrl: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE',
    note: 'Icon set used throughout the interface. A subset of icons is additionally MIT-licensed, derived from the Feather project.',
  },
  {
    name: 'Outfit (font)',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
  },
  {
    name: 'uiohook-napi',
    license: 'MIT',
    licenseUrl: 'https://github.com/SnosMe/uiohook-napi/blob/main/LICENSE',
    note: 'Powers system-wide push-to-talk and mute/deafen hotkeys.',
  },
  {
    name: 'ffmpeg-static',
    license: 'GPL-3.0-or-later',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.txt',
    note: 'npm packaging wrapper around the bundled FFmpeg binary below.',
  },
  {
    name: 'FFmpeg (bundled binary)',
    license: 'GPL v3',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.txt',
    note: 'Used to process Soundboard clips, run as a separate process.',
    sourceUrl: 'https://github.com/FFmpeg/FFmpeg/commit/e38092ef93',
  },
  {
    name: 'Room icons — game-icons.net',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    note: 'Icons by the game-icons.net contributors.',
    sourceUrl: 'https://game-icons.net/',
  },
];
