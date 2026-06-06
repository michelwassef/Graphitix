describe('fontControls proportional font resize', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function createTextInSvgBox(key){
    const svgBox = document.getElementById('svgbox');
    const svg = svgBox.querySelector('svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = key;
    svg.appendChild(text);
    return text;
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-scatter-1" aria-selected="true"></button>
      </div>
      <div id="svgbox" class="svgbox" style="width: 100px; height: 100px;">
        <svg></svg>
      </div>
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock">
          <button id="scatterFontHost" type="button">Font host</button>
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/fontControls.js');

    const svgBox = document.getElementById('svgbox');
    Object.assign(svgBox.dataset, {
      resizerProportionalFontResize: 'true',
      resizerDefaultWidth: '100',
      resizerDefaultHeight: '100',
      graphWidthPx: '100',
      graphHeightPx: '100',
      resizerAspectLocked: 'false',
      resizerLastAxis: 'x'
    });
  });

  test('manual per-element font sizes keep their own proportional baselines', () => {
    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.markText).toBe('function');

    fontControls.importScopeStyles('scatter', {
      graphTitle: { fontSize: '20px', fontSizeResizeReference: 1 },
      xTitle: { fontSize: '10px', fontSizeResizeReference: 1 }
    }, { prune: false });

    const title = createTextInSvgBox('Title');
    const xTitle = createTextInSvgBox('X title');
    fontControls.markText(title, { scopeId: 'scatter', key: 'graphTitle' });
    fontControls.markText(xTitle, { scopeId: 'scatter', key: 'xTitle' });

    expect(title.getAttribute('font-size')).toBe('20px');
    expect(xTitle.getAttribute('font-size')).toBe('10px');

    const svgBox = document.getElementById('svgbox');
    svgBox.dataset.graphWidthPx = '200';
    svgBox.style.width = '200px';
    fontControls.applySavedStyle(title);
    fontControls.applySavedStyle(xTitle);

    expect(title.getAttribute('font-size')).toBe('40px');
    expect(xTitle.getAttribute('font-size')).toBe('20px');

    svgBox.dataset.resizerProportionalFontResize = 'false';
    fontControls.applySavedStyle(title);
    fontControls.applySavedStyle(xTitle);

    expect(title.getAttribute('font-size')).toBe('20px');
    expect(xTitle.getAttribute('font-size')).toBe('10px');
  });
});
