const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else if (dirFile.endsWith('.tsx') || dirFile.endsWith('.ts')) {
      filelist.push(dirFile);
    }
  });
  return filelist;
};

const files = walkSync(path.join(__dirname, 'src/components'));

let totalReplacements = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace solid green background blocks with nexus-gradient
  content = content.replace(/bg-\[#25D366\]/g, 'nexus-gradient');
  content = content.replace(/bg-gradient-to-r from-\[#25D366\] to-\[#1EBE5D\]/g, 'nexus-gradient');
  
  // Replace text colors
  content = content.replace(/text-\[#25D366\]/g, 'text-blue-400');
  
  // Replace border colors
  content = content.replace(/border-\[#25D366\]/g, 'border-blue-500');
  
  // Replace fill colors (for SVGs like Lucide icons)
  content = content.replace(/fill-\[#25D366\]/g, 'fill-blue-400');
  
  // Also handle rgba combinations
  content = content.replace(/rgba\(37,211,102/g, 'rgba(59,130,246'); // Map to blue-500 RGB
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    totalReplacements++;
    console.log(`Updated ${file}`);
  }
});

console.log(`Done! Modified ${totalReplacements} files.`);
