const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', '.next', '.git', 'dist', 'build', '.claude', 'search_results.txt', 'search_results.json', 'search_results_utf8.json', 'package-lock.json', '.expo'];
const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml', '.html', '.css', '.scss', '.txt', '.env', '.example', '.production', '.local', '.svg'];

const replacements = [
  { from: /RagabPharmacy/g, to: 'RagabPharmacy' },
  { from: /ragabpharmacy/g, to: 'ragabpharmacy' },
  { from: /Ragab Pharmacy/g, to: 'Ragab Pharmacy' },
  { from: /Ragab Pharmacy/g, to: 'Ragab Pharmacy' },
  { from: /ragab/g, to: 'ragab' },
  { from: /Ragab/g, to: 'Ragab' },
  { from: /RAGAB/g, to: 'RAGAB' },
  { from: /رجب/g, to: 'رجب' },
  { from: /صيدلية/g, to: 'صيدلية' },
  { from: /صيدلية/g, to: 'صيدلية' },
  { from: /صيدلية/g, to: 'صيدلية' },
  { from: /Pharmacy/g, to: 'Pharmacy' },
  { from: /pharmacy/g, to: 'pharmacy' },
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (excludeDirs.includes(file)) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else {
      const ext = path.extname(file).toLowerCase();
      // Also process files with no extension like .env
      const isTextFile = textExtensions.includes(ext) || file.startsWith('.env') || !file.includes('.');
      
      if (isTextFile) {
        try {
          let content = fs.readFileSync(fullPath, 'utf8');
          let newContent = content;

          for (const { from, to } of replacements) {
            newContent = newContent.replace(from, to);
          }

          if (content !== newContent) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
            console.log(`Updated content: ${fullPath}`);
          }
        } catch (e) {
          console.error(`Error processing file ${fullPath}:`, e.message);
        }
      }
    }
    
    // Rename file or directory if necessary
    let newFileName = file;
    for (const { from, to } of replacements) {
      newFileName = newFileName.replace(from, to);
    }

    if (file !== newFileName) {
      const newFullPath = path.join(dir, newFileName);
      fs.renameSync(fullPath, newFullPath);
      console.log(`Renamed file/dir: ${fullPath} -> ${newFullPath}`);
    }
  }
}

const targetDir = process.argv[2] || process.cwd();
processDirectory(targetDir);
console.log('Rebrand search and replace completed.');
