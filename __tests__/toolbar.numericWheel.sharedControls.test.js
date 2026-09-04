describe('shared toolbar numeric wheel transactions', () => {
  function wheel(target, deltaY) {
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY
    }));
  }

  function flushLiveFrame() {
    jest.advanceTimersByTime(0);
  }

  function finishGesture() {
    jest.advanceTimersByTime(window.Shared.workspaceToolbar.numericWheelCommitDelayMs);
  }

  function installSharedModules(modulePath) {
    jest.resetModules();
    delete window.Shared;
    window.Shared = {};
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');
    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange(entry) {
        recorded.push(entry);
      }
    };
    require(modulePath);
    return recorded;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    delete window.Main;
  });

  test('grid line width uses its declared step, updates live once per frame, and records one undo entry', () => {
    const recorded = installSharedModules('../js/shared/gridControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'hist';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    let style = { color: '#dddddd', thickness: 1, pattern: 'solid', transparency: 0 };
    const applied = [];
    window.Shared.gridControls.show({
      scopeId: 'hist',
      ownerTabId: 'tab-a',
      host,
      target: host,
      controls: { thicknessStep: 0.25 },
      getStyle: () => ({ ...style }),
      onStyleChange(next) {
        style = { ...next };
        applied.push(style.thickness);
      }
    });

    const chip = host.querySelector('.grid-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    for(let i = 0; i < 4; i += 1){
      wheel(chip, -100);
    }
    expect(style.thickness).toBe(1);

    flushLiveFrame();
    expect(style.thickness).toBe(2);
    expect(applied).toEqual([2]);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('grid:hist:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(2);
  });

  test('shared line style chips round fractional pixel widths without changing the value', () => {
    installSharedModules('../js/shared/gridControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'hist';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    const style = { color: '#dddddd', thickness: 1.8391, pattern: 'solid', transparency: 0 };
    window.Shared.gridControls.show({
      scopeId: 'hist',
      ownerTabId: 'tab-a',
      host,
      target: host,
      controls: { thicknessStep: 0.5 },
      getStyle: () => ({ ...style }),
      onStyleChange: () => {}
    });

    const value = host.querySelector('.grid-controls-panel .shared-border-style-chip-value');
    expect(value?.textContent).toBe('1.84px');
    expect(style.thickness).toBe(1.8391);
  });

  test('additional-line width keeps the configured tenth-pixel step instead of a hard-coded half-pixel step', () => {
    const recorded = installSharedModules('../js/shared/additionalLineControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    let thickness = 2;
    window.Shared.additionalLineControls.show({
      scopeId: 'box',
      host,
      target: host,
      controls: {
        showSummary: false,
        showScope: false,
        showPattern: false,
        showTransparency: false,
        thicknessStep: 0.1
      },
      getThickness: () => thickness,
      onThicknessChange(value) {
        thickness = Number(value);
      },
      getColor: () => '#000000',
      onColorChange: () => {}
    });

    const chip = host.querySelector('.additional-line-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    for(let i = 0; i < 3; i += 1){
      wheel(chip, -100);
    }
    flushLiveFrame();
    expect(thickness).toBeCloseTo(2.3, 8);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('additionalLine:box:thickness');
    expect(recorded[0].from).toBe(2);
    expect(recorded[0].to).toBeCloseTo(2.3, 8);
  });

  test('significance thickness keeps one owner-scoped undo transaction across a wheel burst', () => {
    const recorded = installSharedModules('../js/shared/significanceControls.js');
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    document.body.appendChild(host);
    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let thickness = 1;
    window.Shared.significanceControls.registerSignificanceElement(line, {
      orientation: 'vertical',
      scopeId: 'box',
      disableOverlay: true,
      getThickness: () => thickness,
      getColor: () => '#000000',
      getWhiskers: () => true,
      onThicknessChange(value) {
        thickness = Number(value);
      },
      onColorChange: () => {},
      onWhiskersChange: () => {}
    });
    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const chip = host.querySelector('.significance-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    expect(host.dataset.workspaceTabId).toBe('tab-a');

    wheel(chip, -100);
    wheel(chip, -100);
    flushLiveFrame();
    expect(thickness).toBe(1.5);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('significance:box:vertical:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(1.5);

    activeTabId = 'tab-b';
    recorded[0].apply(recorded[0].from, 'undo');
    // Undo targets the original owner callback, while panel synchronization is
    // owner-scoped and must not repoint the visible toolbar at tab B.
    expect(thickness).toBe(1);
    expect(host.dataset.workspaceTabId).toBe('tab-a');
  });

  test('significance toolbar places the Box label control before scientific formatting', () => {
    installSharedModules('../js/shared/significanceControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    ownerRoot.appendChild(svg);
    const labelControl = document.createElement('label');
    labelControl.id = 'boxSignificanceLabelCtl';
    labelControl.className = 'significance-controls-panel__field';
    const label = document.createElement('span');
    label.className = 'significance-controls-panel__field-label';
    label.textContent = 'Label';
    const select = document.createElement('select');
    select.id = 'boxSignificanceLabelMode';
    select.setAttribute('data-significance-label-mode', '1');
    select.append(new Option('Decision (* / NS; D / ND for FDR)', 'decision'), new Option('P-value', 'p'));
    labelControl.append(label, select);
    ownerRoot.append(labelControl);
    document.body.appendChild(ownerRoot);

    window.Shared.significanceControls.registerSignificanceElement(line, {
      orientation: 'vertical',
      scopeId: 'box',
      disableOverlay: true,
      labelControl,
      getLabelMode: () => 'p',
      getThickness: () => 1,
      getColor: () => '#000000',
      getWhiskers: () => true,
      getWhiskerMode: () => 'adaptive',
      getPScientific: () => false,
      getPDecimals: () => 2
    });
    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const fields = Array.from(host.querySelectorAll('.significance-controls-panel__field'))
      .map(field => field.querySelector('.significance-controls-panel__field-label')?.textContent);
    expect(fields).toEqual(['Border', 'Whiskers', 'Whisker Style', 'Label', 'Scientific', 'Decimals']);
    expect(select.value).toBe('p');
    expect(labelControl.parentElement).toBe(host.querySelector('.significance-controls-panel__row'));
  });
});
