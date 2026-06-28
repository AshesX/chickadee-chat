const fs = require('fs');

const file = 'g:/Code/chickadee-chat/apps/desktop/src/renderer/src/styles.css';
let code = fs.readFileSync(file, 'utf-8');

const regex = /\/\*[\s\S]*?\*\//g;
let match;
let matches = [];
while ((match = regex.exec(code)) !== null) {
  matches.push({
    index: match.index,
    length: match[0].length,
    content: match[0]
  });
}
matches.sort((a, b) => b.index - a.index);

for (const m of matches) {
  let replaceWith = '';
  
  if (m.content.startsWith('/* ──')) {
    const lines = m.content.split('\n');
    replaceWith = lines[0];
    if (!replaceWith.endsWith('*/') && !replaceWith.endsWith(' */')) {
      // It might be like `/* ── Button primitive (.btn) ───────────` without `*/` on the same line
      replaceWith += ' */';
    }
  } else if (m.content.includes('component styles (tokens & globals live in theme.css)')) {
    replaceWith = '/* Chickadee Chat — component styles */';
  } else if (
    m.content.includes('no-drag so it overrides the header drag region') ||
    m.content.includes('cancel the row\'s press-scale') ||
    m.content.includes('freeze the per-frame animations to save GPU/CPU') ||
    m.content.includes('toggled by opacity only (compositor-friendly)') ||
    m.content.includes('Above the avatar speaking ring (.tile__avatar::after) so the mute/deafen badge') ||
    m.content.includes('clipped at x=0 by this scroll container\'s overflow')
  ) {
    replaceWith = m.content;
  } else {
    replaceWith = '';
  }
  
  // Also optionally remove the preceding newline and whitespace if we are deleting it entirely
  // A simpler way: just replace with empty string, we'll do a regex sweep for 3+ newlines next
  code = code.substring(0, m.index) + replaceWith + code.substring(m.index + m.length);
}

// Clean up extra blank lines created by comment deletion
code = code.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');

// If there's spaces before an empty line, just clean up
code = code.replace(/^[ \t]+$/gm, '');

fs.writeFileSync(file, code);
console.log('Processed styles.css');
