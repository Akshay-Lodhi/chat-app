const fs = require('fs');
const path = require('path');

const directory = 'src';

const regexes = [
  { pattern: /bg-\[#(111b21|111B21)\]/g, replacement: 'bg-background' },
  { pattern: /bg-\[#(1f2c34|202c33)\]/g, replacement: 'bg-surface' },
  { pattern: /bg-\[#2a3942\]/g, replacement: 'bg-surface-hover' },
  { pattern: /bg-\[#374a59\]/g, replacement: 'bg-surface-active' },
  { pattern: /bg-\[#0b141a\]/g, replacement: 'bg-chat-bg' },
  { pattern: /border-\[#222d34\]/g, replacement: 'border-surface-border' },
  { pattern: /text-\[#(e9edef|E9EDEF)\]/g, replacement: 'text-text-primary' },
  { pattern: /text-\[#(8696a0|8696A0)\]/g, replacement: 'text-text-secondary' },
  { pattern: /text-\[#(667781|667781)\]/g, replacement: 'text-text-tertiary' }
];

function walkDir(dir) {
  let files = fs.readdirSync(dir);
  for (let file of files) {
    let fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      
      for (let r of regexes) {
        content = content.replace(r.pattern, r.replacement);
      }
      
      if (original !== content) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

walkDir(directory);
console.log("Done!");
