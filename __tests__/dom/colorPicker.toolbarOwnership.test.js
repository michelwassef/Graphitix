function loadToolbarModules(){
  window.Shared.workspaceToolbar = {};
  require('../../js/shared/workspaceToolbar.js');
  require('../../js/shared/workspaceToolbarAccess.js');
  require('../../js/shared/colorPicker.js');
  require('../../js/shared/symbolToolbar.js');
}

function showBoxSymbolToolbar(){
  const { Shared } = window;
  const page = document.getElementById('boxPage');
  const topbar = page?.querySelector('.workspace-page__topbar[data-toolbar="box"]');
  if(!page || !topbar){
    throw new Error('Box workspace fixture is unavailable.');
  }
  page.hidden = false;
  Shared.workspaceToolbar.renderForElement(topbar);

  const toolbarOwner = topbar.querySelector('.workspace-toolbar');
  const anchor = document.getElementById('boxFontHost');
  if(!toolbarOwner || !anchor){
    throw new Error('Box workspace toolbar did not render its Format dock.');
  }
  toolbarOwner.appendChild(anchor);

  const state = Shared.symbolToolbar.show({
    document,
    anchorId: anchor.id,
    scopeId: 'box',
    target: anchor,
    scope: {
      label: 'Scope',
      value: 'global',
      options: [{ value: 'global', label: 'Global' }]
    },
    fillShape: {
      label: 'Fill / shape',
      showShapePicker: false,
      getColor(){ return '#808080'; },
      getShape(){ return 'circle'; },
      onColorInput(){},
      onColorChange(){},
      onShapeChange(){}
    },
    border: {
      label: 'Border',
      getColor(){ return '#000000'; },
      onColorInput(){},
      onColorChange(){},
      getWidth(){ return 1.5; },
      onWidthChange(){}
    },
    size: { enabled: false },
    transparency: { enabled: false }
  });

  return { ...state, toolbarOwner };
}

describe('shared color picker toolbar ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="boxPage" class="workspace-page">
        <div class="workspace-page__topbar" data-toolbar="box">
          <div data-toolbar-root></div>
        </div>
        <button id="boxFontHost" type="button">Format</button>
      </div>`;
    loadToolbarModules();
  });

  test('retargeted click after editing picker thickness cannot dismiss its owning Format toolbar', () => {
    const { Shared } = window;
    const { host, toolbarOwner } = showBoxSymbolToolbar();
    const borderChip = host.querySelector('.shared-border-style-chip');
    expect(borderChip).toBeTruthy();

    borderChip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const overlay = document.querySelector('.shared-color-picker[data-visible="1"]');
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('input[aria-label="Border thickness"]')).toBeTruthy();
    expect(Shared.isColorPickerOpenFor(host)).toBe(true);
    expect(Shared.isColorPickerOpenFor(toolbarOwner)).toBe(true);

    // A selection drag can synthesize its final click on a common ancestor outside
    // the body-ported picker. That click still belongs to the open picker and must
    // not collapse either the contextual host or the workspace Format section.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(overlay.dataset.visible).toBe('1');
    expect(host.classList.contains('font-toolbar-host--visible')).toBe(true);
    expect(host.style.display).not.toBe('none');
    expect(toolbarOwner.dataset.toolbarActiveSection).toMatch(/-format$/);

    // A genuine outside pointer press remains the authoritative dismissal path:
    // colorPicker closes first, then the normal outside click may close the host.
    const outside = document.createElement('button');
    document.getElementById('boxPage').appendChild(outside);
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(overlay.dataset.visible).toBe('0');
    expect(Shared.isColorPickerOpenFor(host)).toBe(false);

    outside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(host.style.display).toBe('none');
    expect(toolbarOwner.dataset.toolbarActiveSection).toMatch(/-general$/);
  });

  test('native color-picker fallback clicks its input when showPicker is unavailable', () => {
    const { host } = showBoxSymbolToolbar();
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
    let clickedFallbackInput = null;
    const recordFallbackClick = event => {
      if(event.target?.classList?.contains('shared-color-picker__hidden-fallback-input')){
        clickedFallbackInput = event.target;
      }
    };

    try{
      Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
      Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: undefined });
      document.addEventListener('click', recordFallbackClick, true);
      host.querySelector('.shared-border-style-chip').click();

      const overlay = document.querySelector('.shared-color-picker[data-visible="1"]');
      const fallbackButton = overlay.querySelector('.shared-color-picker__eyedropper');
      expect(fallbackButton.getAttribute('aria-label')).toBe('Open the system color picker');
      fallbackButton.click();

      expect(clickedFallbackInput).toBeTruthy();
      expect(clickedFallbackInput.isConnected).toBe(true);
    }finally{
      document.removeEventListener('click', recordFallbackClick, true);
      if(originalEyeDropper){
        Object.defineProperty(window, 'EyeDropper', originalEyeDropper);
      }else{
        delete window.EyeDropper;
      }
      if(originalShowPicker){
        Object.defineProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
      }else{
        delete HTMLInputElement.prototype.showPicker;
      }
    }
  });
});
