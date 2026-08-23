describe('Shared symbol toolbar numeric formatting', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<button id="numericFormatHost"></button>';
    require('../js/vendor.js');
    require('../js/shared/undo.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/symbolToolbar.js');
  });

  test('uses at most two decimals for shared size and border projections', () => {
    const toolbar = window.Shared.symbolToolbar.show({
      document,
      anchorId: 'numericFormatHost',
      scopeId: 'numericFormat',
      fillShape: {
        getColor(){ return '#777777'; },
        getShape(){ return 'circle'; },
        onColorInput(){},
        onColorChange(){},
        onShapeChange(){}
      },
      border: {
        getColor(){ return '#000000'; },
        onColorInput(){},
        onColorChange(){},
        getWidth(){ return 1.236789; },
        onWidthChange(){}
      },
      size: {
        step: 0.01,
        get(){ return 2.790303; },
        onChange(){}
      },
      transparency: { enabled: false }
    });

    const fillChip = toolbar.host.querySelector('.shared-fill-style-chip');
    const borderChipValue = toolbar.host.querySelector('.shared-border-style-chip-value');
    expect(fillChip.dataset.sizeText).toBe('2.79px');
    expect(borderChipValue.textContent).toBe('1.24px');

    fillChip.click();
    expect(document.querySelector('.shared-color-picker__scatter-style-input[aria-label="Size"]')?.value).toBe('2.79');

    toolbar.host.querySelector('.shared-border-style-chip').click();
    expect(document.querySelector('.shared-color-picker__scatter-style-input[aria-label="Border thickness"]')?.value).toBe('1.24');
  });
});
