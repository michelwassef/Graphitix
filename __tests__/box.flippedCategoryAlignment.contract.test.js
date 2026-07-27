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

describe('Box flipped category alignment contract', () => {
  test('flipped category ticks, labels, and points share the canonical categorical centers', () => {
    const horizontalRenderer = functionSource(boxSource, 'renderBoxHorizontalFrame');
    expect(horizontalRenderer).toBeTruthy();
    expect(horizontalRenderer).toContain('const categoryTickCenters = categoricalLayout.tickCenters;');
    expect(horizontalRenderer).toContain('const y = categoryTickCenters[i];');
    expect(horizontalRenderer).not.toContain('plotTopY + (i + 0.5) * bandH');
  });

  test('flipped label dragging resolves against the same categorical centers', () => {
    const horizontalRenderer = functionSource(boxSource, 'renderBoxHorizontalFrame');
    expect(horizontalRenderer).toContain('const targetIdx = resolveNearestCategoryIndex(pos.y);');
    expect(horizontalRenderer).not.toContain('Math.floor((pos.y - plotTopY)');
  });
});
