const fs = require('fs');
const path = require('path');

function sourceFiles(root){
  const files = [];
  const visit = (current) => {
    for(const entry of fs.readdirSync(current, { withFileTypes:true })){
      const fullPath = path.join(current, entry.name);
      if(entry.isDirectory()) visit(fullPath);
      else if(entry.isFile() && /\.js$/.test(entry.name)) files.push(fullPath);
    }
  };
  visit(path.join(root, 'js'));
  files.push(path.join(root, 'index.html'));
  files.push(path.join(root, 'css', 'style.css'));
  return files;
}

function positiveNumericTokens(value){
  const tokens = value.match(/(?<![\w.])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  return tokens.filter(token => Number(token) > 0);
}

test('source contains no positive letter-spacing declarations', () => {
  const root = path.resolve(__dirname, '..', '..');
  const violations = [];
  const declaration = /(?:letter-spacing|letterSpacing)\s*:\s*([^;\n\r}]+)/g;
  const assignment = /letterSpacing\s*=\s*([^;\n\r}]+)/g;

  for(const file of sourceFiles(root)){
    const source = fs.readFileSync(file, 'utf8');
    for(const pattern of [declaration, assignment]){
      pattern.lastIndex = 0;
      let match;
      while((match = pattern.exec(source))){
        const positive = positiveNumericTokens(match[1]);
        if(positive.length){
          const line = source.slice(0, match.index).split(/\r?\n/).length;
          violations.push(`${path.relative(root, file)}:${line} (${positive.join(', ')})`);
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
