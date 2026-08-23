const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

function extractModuleFunction(source, name){
  const header = new RegExp(`^  (?:async )?function ${name}\\s*\\(`, 'm');
  const match = header.exec(source);
  if(!match){
    return null;
  }
  const start = match.index;
  const headerEnd = source.indexOf('\n', start);
  const braceStart = source.lastIndexOf('{', headerEnd >= 0 ? headerEnd : source.length);
  if(braceStart < start){
    return null;
  }
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(let index = braceStart; index < source.length; index += 1){
    const ch = source[index];
    const next = source[index + 1];
    if(lineComment){
      if(ch === '\n') lineComment = false;
      continue;
    }
    if(blockComment){
      if(ch === '*' && next === '/'){
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if(quote){
      if(escaped){
        escaped = false;
      }else if(ch === '\\'){
        escaped = true;
      }else if(ch === quote){
        quote = null;
      }
      continue;
    }
    if(ch === '/' && next === '/'){
      lineComment = true;
      index += 1;
      continue;
    }
    if(ch === '/' && next === '*'){
      blockComment = true;
      index += 1;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){
      quote = ch;
      continue;
    }
    if(ch === '{') depth += 1;
    if(ch === '}'){
      depth -= 1;
      if(depth === 0){
        return source.slice(start, index + 1);
      }
    }
  }
  return null;
}

describe('Box architecture ownership contract', () => {
  test('draw is a thin public orchestrator', () => {
    const source = boxSource();
    const draw = extractModuleFunction(source, 'draw');
    expect(draw).toBeTruthy();
    expect(draw).toContain('return executeBoxDrawPipeline(drawOpts);');
    expect(draw.split('\n').length).toBeLessThanOrEqual(10);
  });

  test('draw preparation, rendering and finalization have distinct module owners', () => {
    const source = boxSource();
    const pipeline = extractModuleFunction(source, 'executeBoxDrawPipeline');
    const renderer = extractModuleFunction(source, 'renderBoxPreparedFrame');
    const verticalRenderer = extractModuleFunction(source, 'renderBoxVerticalFrame');
    const horizontalRenderer = extractModuleFunction(source, 'renderBoxHorizontalFrame');
    const finalizer = extractModuleFunction(source, 'finalizeBoxRenderedFrame');
    expect(pipeline).toBeTruthy();
    expect(renderer).toBeTruthy();
    expect(verticalRenderer).toBeTruthy();
    expect(horizontalRenderer).toBeTruthy();
    expect(finalizer).toBeTruthy();
    expect(pipeline).toContain('await renderBoxPreparedFrame({');
    expect(pipeline).not.toMatch(/^    (?:async )?function render(?:Vertical|Horizontal)\(/m);
    expect(renderer).toMatch(/^  async function renderBoxPreparedFrame\(/);
    expect(renderer).not.toContain('async function renderVertical(');
    expect(renderer).not.toContain('async function renderHorizontal(');
    expect(renderer).toContain('await renderBoxVerticalFrame(orientationFrameContext)');
    expect(renderer).toContain('await renderBoxHorizontalFrame(orientationFrameContext)');
    expect(verticalRenderer).toMatch(/^  async function renderBoxVerticalFrame\(/);
    expect(horizontalRenderer).toMatch(/^  async function renderBoxHorizontalFrame\(/);
    expect(finalizer).toMatch(/^  function finalizeBoxRenderedFrame\(/);
  });

  test('frame finalization remains in the renderer execution turn', () => {
    const renderer = extractModuleFunction(boxSource(), 'renderBoxPreparedFrame');
    expect(renderer).toContain('const finalization = finalizeBoxRenderedFrame({');
    expect(renderer).toMatch(/const orientationResult = isFlipped\s*\? await renderBoxHorizontalFrame\(orientationFrameContext\)\s*:\s*await renderBoxVerticalFrame\(orientationFrameContext\);\s*const finalization = finalizeBoxRenderedFrame\(/);
    expect(renderer).toContain('finalization\n    };'.replace('\\n', '\n'));
  });

  test('renderer context contains every preparation-owned dependency', () => {
    const renderer = extractModuleFunction(boxSource(), 'renderBoxPreparedFrame');
    [
      'separatedCategoryUnits',
      'usesGroupedSpacing',
      'groupedGroups',
      'gridStrokeStyle',
      'showFrame'
    ].forEach(marker => expect(renderer).toContain(marker));
  });

  test('statistics controls delegate model, selection and options ownership', () => {
    const source = boxSource();
    const controls = extractModuleFunction(source, 'renderStatsControls');
    expect(extractModuleFunction(source, 'persistBoxStatsTabState')).toBeTruthy();
    expect(extractModuleFunction(source, 'buildBoxStatsControlsModel')).toBeTruthy();
    expect(extractModuleFunction(source, 'renderBoxStatsConditionSelector')).toBeTruthy();
    expect(extractModuleFunction(source, 'renderBoxStatsOptionsPanel')).toBeTruthy();
    expect(controls).toContain('const model = buildBoxStatsControlsModel(traces);');
    expect(controls).toContain('renderBoxStatsConditionSelector(traces, controls);');
    expect(controls).toContain('renderBoxStatsOptionsPanel({');
    expect(controls.split('\n').length).toBeLessThanOrEqual(100);
    expect(source).not.toMatch(/function persistTabState\s*\(/);
  });

  test('flip-axis ownership is session-first across capture, activation and draw', () => {
    const source = boxSource();
    const captureControls = extractModuleFunction(source, 'readBoxOwnedRuntimeControls');
    const bindOwned = extractModuleFunction(source, 'bindBoxOwnedRuntimeRecord');
    const initUi = extractModuleFunction(source, 'initUI');
    const pipeline = extractModuleFunction(source, 'executeBoxDrawPipeline');
    const activation = extractModuleFunction(source, 'syncBoxActivationState');
    const payload = extractModuleFunction(source, 'getPayload');

    expect(captureControls).toContain('resolveBoxOwnedFlipAxes(owner.state, false)');
    expect(bindOwned).toContain('state.flipAxes = ownedFlipAxes;');
    expect(bindOwned).toContain("getBoxNodeById('boxFlipAxes', { root: recordRoot");
    expect(initUi).toContain('resolveBoxOwnedFlipAxes(initialSession?.state, false)');
    expect(initUi).not.toContain('state.flipAxes = !!els.boxFlipAxes.checked');
    expect(pipeline).toContain('resolveBoxOwnedFlipAxes(drawSession?.state, false)');
    expect(pipeline).not.toContain('const isFlipped = !!els.boxFlipAxes?.checked');
    expect(activation).toContain('activate-tab-rebind-owned-runtime');
    expect(payload).toContain('flipAxes: controlSnapshot.flipAxes');
  });

  test('the undefined legacy workspace identifier cannot return', () => {
    expect(boxSource()).not.toMatch(/\bactiveWorkspaceTabId\b/);
  });
});
