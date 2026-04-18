const fs = require('fs');
const path = require('path');

function walk(dir){
  let results = [];
  for(const entry of fs.readdirSync(dir)){
    const p = path.join(dir, entry);
    const stat = fs.statSync(p);
    if(stat.isDirectory()) results = results.concat(walk(p));
    else if(p.endsWith('.js')) results.push(p);
  }
  return results;
}

const root = path.resolve('functions');
const files = walk(root);
const re = /from\s+(['\"])((?:\.\./)+)_shared\/([^'\"]+)\1/;
let changedFiles = 0;
for(const f of files){
  let content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  let modified = false;
  for(let i=0;i<lines.length;i++){
    const m = re.exec(lines[i]);
    if(m){
      const quote = m[1];
      const modulePath = m[3];
      const target = path.join(root, '_shared', modulePath);
      const rel = path.relative(path.dirname(f), target).replace(/\\\\/g, '/');
      let newPath = rel;
      if(!newPath.startsWith('.')) newPath = './' + newPath;
      const newLine = lines[i].replace(re, `from ${quote}${newPath}${quote}`);
      if(newLine !== lines[i]){
        lines[i] = newLine;
        modified = true;
        console.log('Updated', f, '=>', newPath);
      }
    }
  }
  if(modified){
    fs.writeFileSync(f, lines.join('\n'), 'utf8');
    changedFiles++;
  }
}
console.log('Done. Files changed:', changedFiles);
