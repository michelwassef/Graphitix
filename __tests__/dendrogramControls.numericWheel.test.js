describe('dendrogramControls numeric wheel editing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    delete window.Shared.dendrogramControls;
    jest.resetModules();
    require('../js/shared/dendrogramControls.js');
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('wheel burst applies thickness live and records one undo entry', () => {
    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'heatmap';
    document.body.appendChild(host);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    document.body.appendChild(svg);

    let thickness = 1;
    window.Shared.dendrogramControls.registerDendrogramElement(line, {
      orientation: 'vertical',
      scopeId: 'heatmap',
      getThickness: () => thickness,
      getColor: () => '#333333',
      onThicknessChange: value => { thickness = value; },
      onColorChange: () => {}
    });

    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.dendrogram-controls-panel input[type="number"]');
    expect(input).toBeTruthy();

    for(let i = 0; i < 4; i += 1){
      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    }
    expect(input.value).toBe('2');
    expect(thickness).toBe(1);

    jest.advanceTimersByTime(0);
    expect(thickness).toBe(2);
    expect(recorded).toHaveLength(0);

    jest.advanceTimersByTime(window.Shared.workspaceToolbar.numericWheelCommitDelayMs);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('dendrogram:heatmap:vertical:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(2);
  });

  test('editing point thickness switches auto width mode to fixed and remains undoable', () => {
    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'heatmap';
    document.body.appendChild(host);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    document.body.appendChild(svg);

    let mode = 'auto';
    let thickness = 1;
    window.Shared.dendrogramControls.registerDendrogramElement(line, {
      orientation: 'horizontal',
      scopeId: 'heatmap',
      getMode: () => mode,
      getThickness: () => thickness,
      getColor: () => '#333333',
      onModeChange: value => { mode = value; },
      onThicknessChange: value => { thickness = value; },
      onColorChange: () => {}
    });

    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const select = host.querySelector('.dendrogram-controls-panel select');
    const input = host.querySelector('.dendrogram-controls-panel input[type="number"]');
    expect(select.value).toBe('auto');
    expect(input.disabled).toBe(false);

    input.value = '2';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mode).toBe('fixed');
    expect(thickness).toBe(2);
    expect(select.value).toBe('fixed');
    expect(recorded).toHaveLength(2);
    expect(recorded[0].label).toBe('dendrogram:heatmap:horizontal:mode');
    expect(recorded[0].from).toBe('auto');
    expect(recorded[0].to).toBe('fixed');
    expect(recorded[1].label).toBe('dendrogram:heatmap:horizontal:thickness');
    expect(recorded[1].from).toBe(1);
    expect(recorded[1].to).toBe(2);
  });
});
