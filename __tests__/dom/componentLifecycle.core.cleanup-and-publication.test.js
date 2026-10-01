'use strict';
const { loadFreshLifecycle } = require('../../test-support/componentLifecycleTestSetup');
const path = require('node:path');
const { findNodes, memberPath, readScriptAst, staticName } = require('../../test-support/sourceAst');
let lc;
const loadFresh = () => { lc = loadFreshLifecycle(); };
const sourceAst = relativePath => readScriptAst(path.join(__dirname, '..', '..', relativePath));

describe('component runtime ownership adapter cleanup', () => {
  test('scatter selection state is owned runtime, not module-level Maps', () => {
    const ast = sourceAst('js/components/scatter.js');
    const declarations = findNodes(ast, node => node.type === 'VariableDeclarator');
    ['scatterRowSelectionsByTab', 'scatterThresholdSelectionsByTab'].forEach(name => {
      expect(declarations.some(node => (
        node.id?.name === name
        && node.init?.type === 'NewExpression'
        && memberPath(node.init.callee) === 'Map'
      ))).toBe(false);
    });
    expect(findNodes(ast, node => node.type === 'Property' && (
      staticName(node.key) === 'selection'
      && node.value?.type === 'CallExpression'
      && memberPath(node.value.callee) === 'createDefaultScatterOwnedSelectionState'
    )).length).toBeGreaterThan(0);
    expect(findNodes(ast, node => node.type === 'FunctionDeclaration'
      && node.id?.name === 'writeScatterOwnedSelectionState')).toHaveLength(1);
    ['writeScatterSelectedRowsForTab', 'writeScatterThresholdRowsForTab'].forEach(name => {
      expect(findNodes(ast, node => node.type === 'CallExpression'
        && memberPath(node.callee) === name).length).toBeGreaterThan(0);
    });
  });

  test('components do not bypass createRuntimeOwner for owned-runtime storage', () => {
    const componentFiles = ['box.js', 'scatter.js', 'pca.js', 'line.js'];
    const forbiddenCalls = new Set([
      'workspaceTabs.getOwnedRuntimeRecord',
      'workspaceTabs.setOwnedRuntimeRecord',
      'workspaceTabs.clearOwnedRuntimeRecord',
      'Shared.workspaceTabs.getOwnedRuntimeRecord',
      'Shared.workspaceTabs.setOwnedRuntimeRecord',
      'Shared.workspaceTabs.clearOwnedRuntimeRecord'
    ]);
    componentFiles.forEach(file => {
      const ast = sourceAst(path.join('js/components', file));
      const calls = findNodes(ast, node => node.type === 'CallExpression');
      expect(calls.some(node => forbiddenCalls.has(memberPath(node.callee)))).toBe(false);
      expect(calls.some(node => memberPath(node.callee)
        === 'Shared.componentLifecycle.createRuntimeOwner')).toBe(true);
    });
  });
});

describe('componentLifecycle — draw option sanitation', () => {
  beforeEach(loadFresh);

  test('removes live objects and preserves plain owner-scoped metadata', () => {
    const event = new Event('click');
    const node = document.createElement('div');
    const session = { tabId: 'tab-a' };
    const result = lc.sanitizeComponentDrawOptions('venn', {
      reason: 'analysis-update',
      force: true,
      nested: { value: 3, node },
      event,
      session,
      callback: () => {}
    }, {
      tabId: 'tab-a',
      sessionGeneration: 7
    });

    expect(result).toEqual({
      reason: 'analysis-update',
      force: true,
      nested: { value: 3 },
      tabId: 'tab-a',
      sessionGeneration: 7,
      renderImpact: 'analysis'
    });
  });

  test('drops circular and non-plain values without losing valid flags', () => {
    const circular = { keep: true };
    circular.self = circular;
    const result = lc.sanitizeComponentDrawOptions('scatter', {
      reason: 'style-change',
      viewOnly: true,
      circular,
      controller: new AbortController()
    }, { tabId: 'tab-b' });

    expect(result).toEqual({
      reason: 'style-change',
      viewOnly: true,
      circular: { keep: true },
      tabId: 'tab-b',
      renderImpact: 'layout'
    });
  });

  test('optional owner draw queues preserve absence instead of manufacturing phantom work', () => {
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', null, { tabId: 'tab-a' })).toBeNull();
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', {}, { tabId: 'tab-a' })).toBeNull();
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', { viewOnly: true }, { tabId: 'tab-a' })).toEqual({
      viewOnly: true,
      tabId: 'tab-a',
      reason: 'heatmap-draw',
      renderImpact: 'layout'
    });
  });
});

describe('componentLifecycle — passive activation initialization', () => {
  beforeEach(loadFresh);

  test('a passive rebind cannot mark an uninitialized component ready without full init', () => {
    const component = { ready: false };
    const ensureBindings = jest.fn(() => {
      component.ready = true;
      return true;
    });
    const init = jest.fn(() => {
      component.ready = true;
    });
    const activate = lc.bindTabActivation({
      component,
      componentKey: 'venn',
      resolveRoot: () => document.body,
      ensureBindings,
      init
    });

    expect(activate({ id: 'workspace-3' }, {
      prepareRuntimeTarget: true,
      passiveControls: true,
      reason: 'recovery-restore:prepare-runtime-target'
    })).toBe(true);

    expect(ensureBindings).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({
      root: document.body,
      tabId: 'workspace-3',
      reason: 'recovery-restore:prepare-runtime-target'
    }));
    expect(component.ready).toBe(true);
  });

  test('an already initialized component may use a passive rebind without reinitializing', () => {
    const component = { ready: true };
    const ensureBindings = jest.fn(() => true);
    const init = jest.fn();
    const activate = lc.bindTabActivation({
      component,
      componentKey: 'pca',
      resolveRoot: () => document.body,
      ensureBindings,
      init
    });

    expect(activate({ id: 'workspace-4' }, {
      prepareRuntimeTarget: true,
      passiveControls: true,
      reason: 'tab-switch:prepare-runtime-target'
    })).toBe(true);

    expect(ensureBindings).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
  });
});

describe('componentLifecycle — primary graph publication detection', () => {
  beforeEach(loadFresh);

  function markRenderable(element, width = 320, height = 240) {
    element.getBoundingClientRect = jest.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height
    }));
    return element;
  }

  test('scoped validation ignores auxiliary SVG content outside the primary graph surface', () => {
    const root = markRenderable(document.createElement('div'));
    const primary = markRenderable(document.createElement('div'));
    primary.id = 'primaryPlot';
    const primarySvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    primary.appendChild(primarySvg);

    const auxiliary = markRenderable(document.createElement('div'));
    const auxiliarySvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const auxiliaryPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    auxiliaryPath.setAttribute('d', 'M0 0 L20 20');
    auxiliarySvg.appendChild(auxiliaryPath);
    auxiliary.appendChild(auxiliarySvg);

    root.append(primary, auxiliary);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root)).toBe(true);
    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#primaryPlot'],
      allowText: false
    })).toBe(false);

    const primaryCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    primaryCircle.setAttribute('r', '5');
    primarySvg.appendChild(primaryCircle);

    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#primaryPlot'],
      allowText: false
    })).toBe(true);

    root.remove();
  });

  test('content selectors reject axes until a component data mark is published', () => {
    const root = markRenderable(document.createElement('div'));
    const plot = markRenderable(document.createElement('div'));
    plot.id = 'rocPlot';
    const svg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    plot.appendChild(svg);
    root.appendChild(plot);
    document.body.appendChild(root);

    const options = {
      selectors: ['#rocPlot'],
      contentSelectors: ['path[data-series]'],
      allowText: false
    };
    expect(lc.hasRenderableGraphContent(root, options)).toBe(false);

    const curve = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curve.setAttribute('data-series', 'Example');
    curve.setAttribute('d', 'M0 10 L100 0');
    svg.appendChild(curve);
    expect(lc.hasRenderableGraphContent(root, options)).toBe(true);

    root.remove();
  });

  test('a selected SVG root is validated directly instead of only through descendants', () => {
    const root = markRenderable(document.createElement('div'));
    const surfaceSvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    surfaceSvg.id = 'surfaceSvg';
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0,0 20,0 10,15');
    surfaceSvg.appendChild(polygon);
    root.appendChild(surfaceSvg);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#surfaceSvg'],
      allowText: false
    })).toBe(true);

    root.remove();
  });

  test('text-only placeholders do not publish a primary graph when text is excluded', () => {
    const root = markRenderable(document.createElement('div'));
    const plot = markRenderable(document.createElement('div'));
    plot.id = 'plot';
    const svg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = 'Preparing graph';
    svg.appendChild(text);
    plot.appendChild(svg);
    root.appendChild(plot);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root, { selectors: ['#plot'] })).toBe(true);
    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#plot'],
      allowText: false
    })).toBe(false);

    root.remove();
  });

  test('a standardized terminal plot notice counts as a published result', () => {
    const root = markRenderable(document.createElement('div'));
    const plot = markRenderable(document.createElement('div'));
    plot.id = 'plot';
    const notice = document.createElement('i');
    notice.setAttribute('data-plot-notice', '1');
    notice.textContent = 'This view requires another data column.';
    plot.appendChild(notice);
    root.appendChild(plot);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#plot'],
      contentSelectors: ['path[data-series]'],
      allowText: false
    })).toBe(true);

    root.remove();
  });
});
