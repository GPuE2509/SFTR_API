const fs = require('fs');
const path = require('path');

const translations = require('./english_strings.json');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function walk(dir) {
  let files = fs.readdirSync(dir);
  files.forEach(file => {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath);
    } else if (filepath.endsWith('.js')) {
      let content = fs.readFileSync(filepath, 'utf8');
      let modified = false;

      for (const [vietnamese, english] of Object.entries(translations)) {
        // Replace in single quotes
        let regexSingle = new RegExp("'" + escapeRegExp(vietnamese) + "'", 'g');
        if (regexSingle.test(content)) {
          content = content.replace(regexSingle, "'" + english + "'");
          modified = true;
        }

        // Replace in double quotes
        let regexDouble = new RegExp('"' + escapeRegExp(vietnamese) + '"', 'g');
        if (regexDouble.test(content)) {
          content = content.replace(regexDouble, '"' + english + '"');
          modified = true;
        }

        // Replace in template literals
        let regexTemplate = new RegExp('`' + escapeRegExp(vietnamese) + '`', 'g');
        if (regexTemplate.test(content)) {
          content = content.replace(regexTemplate, '`' + english + '`');
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log('Updated: ' + filepath);
      }
    }
  });
}

walk('./src');
console.log('Replacement complete.');
