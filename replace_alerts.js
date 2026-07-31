const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('d:\\chat_app\\client\\src');

let replacedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('alert(')) {
    // Replace alert(...) with toast.error(...) or toast(...) depending on context
    // Actually, to make it simple and safe for any string:
    let newContent = content.replace(/\balert\((.*?)\)/g, (match, inner) => {
        if (inner.toLowerCase().includes('success') || inner.toLowerCase().includes('copied') || inner.toLowerCase().includes('blocked') || inner.toLowerCase().includes('reported') || inner.toLowerCase().includes('unblocked')) {
            return `toast.success(${inner})`;
        } else {
            return `toast.error(${inner})`; // Most alerts were failures or errors
        }
    });

    // Add import if not present
    if (!newContent.includes("import toast from 'react-hot-toast'") && !newContent.includes('import { toast } from "react-hot-toast"')) {
      // Find the last import
      const lastImportIndex = newContent.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const endOfLine = newContent.indexOf('\n', lastImportIndex);
        newContent = newContent.substring(0, endOfLine + 1) + "import toast from 'react-hot-toast';\n" + newContent.substring(endOfLine + 1);
      } else {
        newContent = "import toast from 'react-hot-toast';\n" + newContent;
      }
    }

    fs.writeFileSync(file, newContent, 'utf8');
    replacedFiles++;
    console.log(`Replaced in ${file}`);
  }
});

console.log(`Replaced alerts in ${replacedFiles} files.`);
