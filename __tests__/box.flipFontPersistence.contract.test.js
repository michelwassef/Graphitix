const fs = require('fs');
const path = require('path');

const boxSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'box.js'), 'utf8').replace(/\r\n/g, '\n');

function functionSource(source, name){
  const header = new RegExp(`^[ \\t]*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm');
  const match = header.exec(source);
  if(!match){
    return null;
  }
  const brace = source.indexOf('{', match.index);
  let depth = 0;
  for(let index = brace; index < source.length; index += 1){
    if(source[index] === '{') depth += 1;
    if(source[index] === '}'){
      depth -= 1;
      if(depth === 0){
        return source.slice(match.index, index + 1);
      }
    }
  }
  return null;
}

describe('Box flip font persistence contract', () => {
  test('flipped renderer keeps saved font roles attached to their semantic data axes', () => {
    const renderer = functionSource(boxSource, 'renderBoxHorizontalFrame');
    expect(renderer).toBeTruthy();
    expect(renderer).toContain("markFontEditable(t, 'xTick');");
    expect(renderer).toContain("markFontEditable(txt, 'yTick');");
    expect(renderer).toContain("markFontEditable(xLabel, 'yTitle', 'yTitle');");
  });

  test('flipped layout uses the persisted semantic font sizes instead of the global fallback', () => {
    const renderer = functionSource(boxSource, 'renderBoxHorizontalFrame');
    expect(renderer).toContain('const categoryTickFontSize =');
    expect(renderer).toContain('const valueTickFontSize =');
    expect(renderer).toContain('const valueTitleFontSize =');
    expect(renderer).toContain("'font-size': categoryTickFontSize");
    expect(renderer).toContain("'font-size': valueTickFontSize");
    expect(renderer).toContain("'font-size': valueTitleFontSize");
  });
});
