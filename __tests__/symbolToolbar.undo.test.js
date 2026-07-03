const loadUndoDeps = () => {
  require('../js/vendor.js');
  require('../js/shared/undo.js');
  require('../js/shared/colorPicker.js');
  require('../js/shared/symbolToolbar.js');
  require('../js/shared/additionalLineControls.js');
  require('../js/shared/gridControls.js');
};

function selectScopedOption(selectEl, value, dataset){
  const options = Array.from(selectEl?.options || []);
  const desiredValue = String(value == null ? '' : value).trim();
  const desiredDataset = String(dataset == null ? '' : dataset).trim();
  const index = options.findIndex(option => (
    !option.disabled
    && String(option.value || '').trim() === desiredValue
    && String(option?.dataset?.scopeDataset || '').trim() === desiredDataset
  ));
  if(index < 0){
    throw new Error(`Scope option not found for ${desiredValue}/${desiredDataset}`);
  }
  selectEl.selectedIndex = index;
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Shared symbol and line control undo', () => {
  beforeEach(() => {
    jest.resetModules();
    loadUndoDeps();
    window.Shared.undoManager.clear();
  });

  test('symbolToolbar records scoped changes and replays exact undo order', () => {
    const { Shared } = window;
    const anchor = document.createElement('button');
    anchor.id = 'symbolTestFontHost';
    document.body.appendChild(anchor);
    const labelScopeA = Shared.encodeScopeValue('label', 'A');
    const labelScopeB = Shared.encodeScopeValue('label', 'B');

    const state = {
      A: { fill: '#111111', alpha: 0 },
      B: { fill: '#222222', alpha: 0 }
    };
    let activeLabel = 'A';

    const toolbarState = Shared.symbolToolbar.show({
      document,
      anchorId: 'symbolTestFontHost',
      scopeId: 'symbolTest',
      target: anchor,
      scope: {
        label: 'Scope',
        value: labelScopeA,
        options: [
          { value: 'global', label: 'Global' },
          { value: labelScopeA, label: 'A', scopeDataset: 'A', scopeKind: 'label' },
          { value: labelScopeB, label: 'B', scopeDataset: 'B', scopeKind: 'label' }
        ],
        onChange(nextScope, ctx){
          const parsed = Shared.decodeScopeValue(nextScope);
          if(parsed.kind === 'label'){
            const scopedLabel = String(ctx?.scopeDataset || '').trim();
            if(scopedLabel){
              activeLabel = scopedLabel;
            }
          }
        }
      },
      fillShape: {
        label: 'Fill',
        shapeOptions: [{ value: 'circle', label: 'Circle' }],
        getColor(ctx){
          if(ctx.scope === 'label' && activeLabel){
            return state[activeLabel].fill;
          }
          return state.A.fill;
        },
        getShape(){
          return 'circle';
        },
        onColorChange(value, ctx){
          if(ctx.scope === 'label' && activeLabel){
            state[activeLabel].fill = value;
          }else{
            state.A.fill = value;
            state.B.fill = value;
          }
        },
        onColorInput(value, ctx){
          if(ctx.scope === 'label' && activeLabel){
            state[activeLabel].fill = value;
          }else{
            state.A.fill = value;
            state.B.fill = value;
          }
        },
        onShapeChange(){ }
      },
      border: {
        label: 'Border',
        getColor(){
          return '#000000';
        },
        onColorChange(){ },
        getWidth(){
          return 0;
        },
        onWidthChange(){ }
      },
      size: {
        enabled: false,
        get(){ return 0; },
        onChange(){ }
      },
      transparency: {
        enabled: true,
        scale: 'fraction',
        get(ctx){
          if(ctx.scope === 'label' && activeLabel){
            return state[activeLabel].alpha;
          }
          return state.A.alpha;
        },
        onChange(value, ctx){
          const normalized = Math.min(1, Math.max(0, Number(value) || 0));
          if(ctx.scope === 'label' && activeLabel){
            state[activeLabel].alpha = normalized;
          }else{
            state.A.alpha = normalized;
            state.B.alpha = normalized;
          }
        }
      }
    });

    const scopeSelect = toolbarState.scopeSelect;
    const host = toolbarState.host;
    const fillInput = host.querySelector('.shared-shape-color-input');
    const transparencyInput = host.querySelector('.additional-line-controls-panel__transparency-input');
    expect(scopeSelect).toBeTruthy();
    expect(fillInput).toBeTruthy();
    expect(transparencyInput).toBeTruthy();

    selectScopedOption(scopeSelect, labelScopeA, 'A');
    fillInput.value = '#ff0000';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.value = '#ff0000';
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));

    selectScopedOption(scopeSelect, labelScopeB, 'B');
    transparencyInput.value = '50';
    transparencyInput.dispatchEvent(new Event('input', { bubbles: true }));

    fillInput.value = '#00ff00';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.value = '#00ff00';
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.A.fill.toLowerCase()).toBe('#ff0000');
    expect(state.B.alpha).toBeCloseTo(0.5, 6);
    expect(state.B.fill.toLowerCase()).toBe('#00ff00');

    const manager = Shared.undoManager;
    expect(manager.undo()).toBe(true);
    expect(state.B.fill.toLowerCase()).toBe('#222222');
    expect(state.B.alpha).toBeCloseTo(0.5, 6);
    expect(state.A.fill.toLowerCase()).toBe('#ff0000');

    expect(manager.undo()).toBe(true);
    expect(state.B.alpha).toBeCloseTo(0, 6);
    expect(state.A.fill.toLowerCase()).toBe('#ff0000');

    expect(manager.undo()).toBe(true);
    expect(state.A.fill.toLowerCase()).toBe('#111111');
    expect(state.B.fill.toLowerCase()).toBe('#222222');

    expect(manager.redo()).toBe(true);
    expect(state.A.fill.toLowerCase()).toBe('#ff0000');
    expect(manager.redo()).toBe(true);
    expect(state.B.alpha).toBeCloseTo(0.5, 6);
    expect(manager.redo()).toBe(true);
    expect(state.B.fill.toLowerCase()).toBe('#00ff00');
  });

  test('symbolToolbar undo restores per-target values after aggregate fill change', () => {
    const { Shared } = window;
    const anchor = document.createElement('button');
    anchor.id = 'symbolGlobalUndoFontHost';
    document.body.appendChild(anchor);
    const labelScopeA = Shared.encodeScopeValue('label', 'A');
    const labelScopeB = Shared.encodeScopeValue('label', 'B');
    const labelScopeC = Shared.encodeScopeValue('label', 'C');
    const state = {
      A: { fill: '#111111' },
      B: { fill: '#222222' },
      C: { fill: '#333333' }
    };
    let activeLabel = 'A';

    const toolbarState = Shared.symbolToolbar.show({
      document,
      anchorId: 'symbolGlobalUndoFontHost',
      scopeId: 'symbolGlobalUndo',
      target: anchor,
      scope: {
        label: 'Scope',
        value: 'global',
        options: [
          { value: 'global', label: 'Global' },
          { value: labelScopeA, label: 'A', scopeDataset: 'A', scopeKind: 'label' },
          { value: labelScopeB, label: 'B', scopeDataset: 'B', scopeKind: 'label' },
          { value: labelScopeC, label: 'C', scopeDataset: 'C', scopeKind: 'label' }
        ],
        onChange(_nextScope, ctx){
          const key = String(ctx?.scopeDataset || '').trim();
          if(key){
            activeLabel = key;
          }
        }
      },
      fillShape: {
        label: 'Fill',
        showShapePicker: false,
        getColor(ctx){
          if(ctx.scope === 'label'){
            return state[activeLabel].fill;
          }
          return state.A.fill;
        },
        getShape(){ return 'circle'; },
        onColorInput(value, ctx){
          if(ctx.scope === 'label'){
            state[activeLabel].fill = value;
            return;
          }
          Object.keys(state).forEach(name => { state[name].fill = value; });
        },
        onColorChange(value, ctx){
          if(ctx.scope === 'label'){
            state[activeLabel].fill = value;
            return;
          }
          Object.keys(state).forEach(name => { state[name].fill = value; });
        },
        onShapeChange(){ }
      },
      border: {
        getColor(){ return '#000000'; },
        onColorChange(){ },
        getWidth(){ return 0; },
        onWidthChange(){ }
      },
      size: { enabled: false },
      transparency: { enabled: false }
    });

    const fillInput = toolbarState.host.querySelector('.shared-shape-color-input');
    fillInput.value = '#ffaa00';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.A.fill.toLowerCase()).toBe('#ffaa00');
    expect(state.B.fill.toLowerCase()).toBe('#ffaa00');
    expect(state.C.fill.toLowerCase()).toBe('#ffaa00');

    expect(Shared.undoManager.undo()).toBe(true);
    expect(state.A.fill.toLowerCase()).toBe('#111111');
    expect(state.B.fill.toLowerCase()).toBe('#222222');
    expect(state.C.fill.toLowerCase()).toBe('#333333');

    expect(Shared.undoManager.redo()).toBe(true);
    expect(state.A.fill.toLowerCase()).toBe('#ffaa00');
    expect(state.B.fill.toLowerCase()).toBe('#ffaa00');
    expect(state.C.fill.toLowerCase()).toBe('#ffaa00');
  });

  test('additionalLineControls keeps scoped dataset identity for undo', () => {
    const { Shared } = window;
    const anchor = document.createElement('button');
    anchor.id = 'lineUndoUnitFontHost';
    document.body.appendChild(anchor);
    const scopeA = Shared.encodeScopeValue('series', 'A');
    const scopeB = Shared.encodeScopeValue('series', 'B');

    const state = {
      A: '#111111',
      B: '#222222'
    };

    Shared.additionalLineControls.show({
      scopeId: 'lineUndoUnit',
      panelTitle: 'Line',
      target: anchor,
      controls: {
        showSummary: false,
        showScope: true,
        showPattern: false,
        showTransparency: false
      },
      scope: {
        label: 'Scope',
        value: scopeA,
        options: [
          { value: scopeA, label: 'A', scopeDataset: 'A', scopeKind: 'series' },
          { value: scopeB, label: 'B', scopeDataset: 'B', scopeKind: 'series' }
        ]
      },
      getSummary: () => '',
      getColor: ctx => state[String(ctx?.scopeDataset || 'A')],
      getThickness: () => 1,
      getPattern: () => 'solid',
      getTransparency: () => 0,
      onColorChange(value, ctx){
        const key = String(ctx?.scopeDataset || '').trim();
        if(key){
          state[key] = value;
        }
      },
      onThicknessChange(){},
      onPatternChange(){},
      onTransparencyChange(){}
    });

    const host = anchor.nextElementSibling;
    const panel = host.querySelector('.additional-line-controls-panel');
    const scopeSelect = panel.querySelector('.additional-line-controls-panel__field--scope select');
    const colorInput = panel.querySelector('.additional-line-controls-panel__color-input');
    expect(scopeSelect).toBeTruthy();
    expect(colorInput).toBeTruthy();

    selectScopedOption(scopeSelect, scopeA, 'A');
    colorInput.value = '#ff0000';
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));

    selectScopedOption(scopeSelect, scopeB, 'B');
    colorInput.value = '#00ff00';
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.A.toLowerCase()).toBe('#ff0000');
    expect(state.B.toLowerCase()).toBe('#00ff00');

    const manager = Shared.undoManager;
    expect(manager.undo()).toBe(true);
    expect(state.B.toLowerCase()).toBe('#222222');
    expect(state.A.toLowerCase()).toBe('#ff0000');

    expect(manager.undo()).toBe(true);
    expect(state.A.toLowerCase()).toBe('#111111');
    expect(state.B.toLowerCase()).toBe('#222222');
  });

  test('additionalLineControls undo restores per-target values after aggregate color change', () => {
    const { Shared } = window;
    const anchor = document.createElement('button');
    anchor.id = 'lineGlobalUndoFontHost';
    document.body.appendChild(anchor);
    const scopeA = Shared.encodeScopeValue('series', 'A');
    const scopeB = Shared.encodeScopeValue('series', 'B');
    const state = { A: '#111111', B: '#222222' };
    let activeSeries = 'A';

    Shared.additionalLineControls.show({
      scopeId: 'lineGlobalUndo',
      panelTitle: 'Line',
      target: anchor,
      controls: {
        showSummary: false,
        showScope: true,
        showPattern: false,
        showTransparency: false
      },
      scope: {
        label: 'Scope',
        value: 'global',
        options: [
          { value: 'global', label: 'Global' },
          { value: scopeA, label: 'A', scopeDataset: 'A', scopeKind: 'series' },
          { value: scopeB, label: 'B', scopeDataset: 'B', scopeKind: 'series' }
        ],
        onChange(_scope, ctx){
          const key = String(ctx?.scopeDataset || '').trim();
          if(key){ activeSeries = key; }
        }
      },
      getSummary: () => '',
      getColor: ctx => ctx?.scope === 'series' ? state[activeSeries] : state.A,
      getThickness: () => 1,
      getPattern: () => 'solid',
      getTransparency: () => 0,
      onColorChange(value, ctx){
        if(ctx?.scope === 'series'){
          state[activeSeries] = value;
          return;
        }
        state.A = value;
        state.B = value;
      },
      onThicknessChange(){},
      onPatternChange(){},
      onTransparencyChange(){}
    });

    const panel = anchor.nextElementSibling.querySelector('.additional-line-controls-panel');
    const colorInput = panel.querySelector('.additional-line-controls-panel__color-input');
    colorInput.value = '#ffaa00';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.A.toLowerCase()).toBe('#ffaa00');
    expect(state.B.toLowerCase()).toBe('#ffaa00');
    expect(Shared.undoManager.undo()).toBe(true);
    expect(state.A.toLowerCase()).toBe('#111111');
    expect(state.B.toLowerCase()).toBe('#222222');
    expect(Shared.undoManager.undo()).toBe(false);
  });

  test('gridControls color preview plus commit records one undo entry', () => {
    const { Shared } = window;
    Shared.getWorkspaceToolbarApi = () => ({
      createSubPanel({ title, panelClass, rowClass }){
        const panel = document.createElement('div');
        panel.className = panelClass || '';
        const heading = document.createElement('div');
        heading.textContent = title || '';
        const row = document.createElement('div');
        row.className = rowClass || '';
        panel.appendChild(heading);
        panel.appendChild(row);
        return { panel, title: heading, row };
      },
      createBorderStyleControl({ colorInputClass, colorInputAttrs, colorValue }){
        const control = document.createElement('div');
        const chip = document.createElement('button');
        const preview = document.createElement('span');
        const value = document.createElement('span');
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = colorInputClass || '';
        Object.entries(colorInputAttrs || {}).forEach(([key, val]) => colorInput.setAttribute(key, val));
        colorInput.value = colorValue || '#000000';
        control.append(chip, preview, value, colorInput);
        return { control, chip, preview, value, colorInput };
      },
      createLinePatternField({ fieldClass, labelClass, selectClass }){
        const field = document.createElement('div');
        field.className = fieldClass || '';
        const label = document.createElement('div');
        label.className = labelClass || '';
        const select = document.createElement('select');
        select.className = selectClass || '';
        ['solid', 'dashed', 'dotted'].forEach(value => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        });
        field.append(label, select);
        return { field, label, select };
      },
      createTransparencyControl({ wrapClass, inputClass, valueClass }){
        const wrap = document.createElement('div');
        wrap.className = wrapClass || '';
        const input = document.createElement('input');
        input.type = 'range';
        input.className = inputClass || '';
        const value = document.createElement('span');
        value.className = valueClass || '';
        wrap.append(input, value);
        return { wrap, input, value };
      },
      showHost(host){ host.style.display = 'grid'; },
      hideHost(host){ host.style.display = 'none'; },
      clearHostSizing(){}
    });

    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const state = { color: '#111111', thickness: 1, pattern: 'solid', transparency: 0 };

    Shared.gridControls.show({
      host: anchor,
      scopeId: 'gridUndo',
      target: anchor,
      defaults: state,
      getStyle: () => ({ ...state }),
      onStyleChange(style){
        Object.assign(state, style);
      }
    });

    const colorInput = anchor.querySelector('.grid-controls-panel__color-input');
    expect(colorInput).toBeTruthy();
    colorInput.value = '#ffaa00';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.color.toLowerCase()).toBe('#ffaa00');
    expect(Shared.undoManager.undo()).toBe(true);
    expect(state.color.toLowerCase()).toBe('#111111');
    expect(Shared.undoManager.undo()).toBe(false);
  });
});
