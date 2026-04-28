const loadUndoDeps = () => {
  require('../js/vendor.js');
  require('../js/shared/undo.js');
  require('../js/shared/colorPicker.js');
  require('../js/shared/symbolToolbar.js');
  require('../js/shared/additionalLineControls.js');
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

  test.skip('symbolToolbar records scoped changes and replays exact undo order', () => {
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

  test.skip('additionalLineControls keeps scoped dataset identity for undo', () => {
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
});
