const fs = require('fs');
const path = require('path');

const regex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const dict = {};

function walk(dir) {
  let files = fs.readdirSync(dir);
  files.forEach(file => {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath);
    } else if (filepath.endsWith('.js')) {
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Match single quotes
      const singleQuoteRegex = /'([^'\\]*(?:\\.[^'\\]*)*)'/g;
      let match;
      while ((match = singleQuoteRegex.exec(content)) !== null) {
        if (regex.test(match[1])) dict[match[1]] = match[1];
      }

      // Match double quotes
      const doubleQuoteRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      while ((match = doubleQuoteRegex.exec(content)) !== null) {
        if (regex.test(match[1])) dict[match[1]] = match[1];
      }

      // Match template literals
      const templateRegex = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;
      while ((match = templateRegex.exec(content)) !== null) {
        if (regex.test(match[1])) dict[match[1]] = match[1];
      }
    }
  });
}

walk('./src');
fs.writeFileSync('vietnamese_strings.json', JSON.stringify(dict, null, 2));
console.log('Extraction complete. Found ' + Object.keys(dict).length + ' strings.');
