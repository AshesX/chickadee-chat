const fs = require('fs');
const file = 'g:/Code/chickadee-chat/apps/desktop/src/renderer/src/styles.css';
const code = fs.readFileSync(file, 'utf-8');

const regex = /\/\*[\s\S]*?\*\//g;
let match;
let result = [];
while ((match = regex.exec(code)) !== null) {
  result.push({
    startLine: code.substring(0, match.index).split('\n').length,
    endLine: code.substring(0, match.index + match[0].length).split('\n').length,
    content: match[0]
  });
}
fs.writeFileSync('g:/Code/chickadee-chat/comments.json', JSON.stringify(result, null, 2));
console.log('Found ' + result.length + ' comments');
