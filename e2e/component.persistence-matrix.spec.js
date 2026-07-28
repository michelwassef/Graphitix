const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PARAMETER_ROOTS = {
  venn: ['style', 'notes'],
  box: ['config'],
  scatter: ['config'],
  pca: ['config'],
  line: ['config'],
  heatmap: ['config'],
  surface: ['config'],
  roc: ['config'],
  survival: ['config'],
  hist: ['config'],
  pie: ['config']
};

async function openComponent(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, componentCase, { first: true });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
  await page.waitForTimeout(componentCase.type === 'hist' ? 1200 : 500);
}

async function auditComponent(page, type, roots) {
  return page.evaluate(async ({ componentType, parameterRoots }) => {
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const component = window.Main.components.registry[componentType];
    const activeTab = window.Main.session.getActiveTab();
    const pathKey = path => path.map(part => typeof part === 'number' ? `[${part}]` : part).join('.');
    const getAtPath = (object, path) => path.reduce((value, part) => value == null ? undefined : value[part], object);
    const setAtPath = (object, path, value) => {
      let cursor = object;
      for (let index = 0; index < path.length - 1; index += 1) {
        cursor = cursor?.[path[index]];
        if (!cursor || typeof cursor !== 'object') return false;
      }
      cursor[path[path.length - 1]] = value;
      return true;
    };
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const leafName = path => String(path[path.length - 1] ?? '');
    const lowerPath = path => path.map(part => String(part).toLowerCase()).join('.');
    const excludedReason = path => {
      const key = lowerPath(path);
      if (/(results?model|reports?model|precomputed|summary|cache|signature|schemaversion|payloadversion|contextversion|lastrunversion|computedat|updatedat|savedat)/.test(key)) {
        return 'derived';
      }
      if (/(^|\.)(rotation|labelpositions|selectedrows|covariates|custompairs|additionalTicks|brokenAxis)(\.|$)/i.test(pathKey(path))) {
        return 'structured-contract';
      }
      if (/(^|\.)(textColor|backgroundColor|axesVarianceScaled|equalAxes|equalScaleAxes|legendAutoHidden)(\.|$)/i.test(pathKey(path))) {
        return 'derived-or-exclusive';
      }
      if (/^config\.stats\.(show|fit|regression)/i.test(pathKey(path))) {
        return 'duplicated-projection';
      }
      if (/(^|\.)(tableformat|graphType|chartType|plotType|viewMode|method)(\.|$)/i.test(pathKey(path))) {
        return 'structural-mode';
      }
      if (/(^|\.)(filename|filehandle|activeviewid)(\.|$)/i.test(key)) {
        return 'document-metadata';
      }
      return null;
    };
    const enumAlternative = (path, current) => {
      const name = leafName(path);
      const key = String(name || '').toLowerCase();
      const value = String(current || '').toLowerCase();
      const fullPath = lowerPath(path);
      if (fullPath.includes('axislabelmodes.')) {
        return value === 'auto' ? 'manual' : 'auto';
      }
      if (fullPath.endsWith('regression.mode')) {
        return value === 'linear' ? 'quadratic' : 'linear';
      }
      const alternatives = {
        notation: { decimal: 'scientific', scientific: 'decimal', auto: 'scientific' },
        notationx: { decimal: 'scientific', scientific: 'decimal', auto: 'scientific' },
        notationy: { decimal: 'scientific', scientific: 'decimal', auto: 'scientific' },
        pattern: { solid: 'dashed', dashed: 'dotted', dotted: 'solid' },
        linepattern: { solid: 'dashed', dashed: 'dotted', dotted: 'solid' },
        axisorigin: { zero: 'lower', lower: 'zero', custom: 'zero' },
        originmode: { zero: 'lower', lower: 'zero', custom: 'zero' },
        sort: { 'size-desc': 'degree-desc', 'degree-desc': 'size-desc', 'size-asc': 'degree-asc', 'degree-asc': 'size-asc' },
        correction: { none: 'holm', holm: 'bonferroni', bonferroni: 'none' },
        multiplecomparisons: { none: 'holm', holm: 'bonferroni', bonferroni: 'none' },
        criterion: { bic: 'aic', aic: 'bic' },
        fitmethod: { ols: 'theil-sen', 'theil-sen': 'ols' },
        regressionmode: { linear: 'quadratic', quadratic: 'linear' },
        colors: { unified: 'individual', individual: 'unified' },
        colormode: { auto: 'individual', individual: 'auto', unified: 'individual' },
        colorscheme: { scientific: 'soft', soft: 'normal', normal: 'grayscale', grayscale: 'colorblind', colorblind: 'scientific' },
        densitypalette: { viridis: 'plasma', plasma: 'viridis' },
        stattype: { auto: 'pearson', pearson: 'spearman', spearman: 'pearson' },
        shape: { circle: 'diamond', diamond: 'square', square: 'circle', triangle: 'diamond' }
      };
      if (alternatives[key]?.[value] !== undefined) return alternatives[key][value];
      if (fullPath.includes('labelshapes.')) return alternatives.shape[value];
      return undefined;
    };
    const mutateValue = (path, value) => {
      const name = leafName(path);
      const key = name.toLowerCase();
      const fullPath = lowerPath(path);
      const isNumericParameter = /(min(?:imum)?|max(?:imum)?|tick|width|size|length|thickness|interval|limit|threshold|offset|gap|angle|alpha|opacity|radius|count|bins|replicate|horizon|season|origin)/.test(key)
        || /axis\.(?:majorticklength|tickinterval)\.[xyz]$/.test(fullPath);
      if (typeof value === 'boolean') return { covered: true, value: !value };
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (/min(?:imum)?$/.test(key)) return { covered: true, value: value - 3 };
        if (/max(?:imum)?$/.test(key)) return { covered: true, value: value + 3 };
        if (/(alpha|opacity|ratio|fraction)/.test(key) && value >= 0 && value <= 1) {
          return { covered: true, value: value < 0.5 ? 0.73 : 0.27 };
        }
        if (Number.isInteger(value)) return { covered: true, value: value >= 5 ? value - 1 : value + 2 };
        return { covered: true, value: value >= 5 ? value - 0.75 : value + 0.75 };
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
          const numeric = Number(trimmed);
          const next = /(alpha|opacity|ratio|fraction)/.test(key) && numeric >= 0 && numeric <= 1
            ? (numeric < 0.5 ? 0.73 : 0.27)
            : (/min(?:imum)?$/.test(key) ? numeric - 3 : (/max(?:imum)?$/.test(key) ? numeric + 3 : (numeric >= 5 ? numeric - 1 : numeric + 2)));
          return { covered: true, value: String(next) };
        }
        if (/color$/.test(key) || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
          return { covered: true, value: trimmed.toLowerCase() === '#2468ac' ? '#ac2468' : '#2468ac' };
        }
        if (/(title|label|text|subtitle)$/.test(key)) {
          return { covered: true, value: `${value || name}-persisted` };
        }
        if (!trimmed && isNumericParameter) {
          if (/min(?:imum)?$/.test(key)) return { covered: true, value: '-7' };
          if (/max(?:imum)?$/.test(key)) return { covered: true, value: '70' };
          return { covered: true, value: '7' };
        }
        if (/axis\.notation\.[xyz]$/.test(fullPath)) {
          return { covered: true, value: trimmed.toLowerCase() === 'scientific' ? 'decimal' : 'scientific' };
        }
        const alternative = enumAlternative(path, value);
        if (alternative !== undefined) return { covered: true, value: alternative };
        return { covered: false };
      }
      if (value === null || value === undefined) {
        if (/(enabled|visible|show|locked)$/.test(key)) return { covered: true, value: true };
        if (isNumericParameter) {
          if (/min(?:imum)?$/.test(key)) return { covered: true, value: -7 };
          if (/max(?:imum)?$/.test(key)) return { covered: true, value: 70 };
          return { covered: true, value: 7 };
        }
      }
      return { covered: false };
    };
    const collect = (value, path, candidates, classified) => {
      const reason = excludedReason(path);
      if (reason) {
        classified.push({ path: pathKey(path), reason });
        return;
      }
      if (Array.isArray(value)) {
        if (!value.length) {
          classified.push({ path: pathKey(path), reason: 'empty-collection' });
          return;
        }
        value.forEach((entry, index) => collect(entry, path.concat(index), candidates, classified));
        return;
      }
      if (value && typeof value === 'object') {
        Object.keys(value).sort().forEach(key => collect(value[key], path.concat(key), candidates, classified));
        return;
      }
      const mutation = mutateValue(path, value);
      if (mutation.covered && !same(mutation.value, value)) {
        candidates.push({ path, key: pathKey(path), before: clone(value), after: clone(mutation.value) });
      } else {
        classified.push({ path: pathKey(path), reason: 'baseline-only', value: clone(value) });
      }
    };
    const collectExpectedLeaves = (value, path, expected) => {
      if (excludedReason(path)) return;
      if (Array.isArray(value)) {
        value.forEach((entry, index) => collectExpectedLeaves(entry, path.concat(index), expected));
        return;
      }
      if (value && typeof value === 'object') {
        Object.keys(value).sort().forEach(key => collectExpectedLeaves(value[key], path.concat(key), expected));
        return;
      }
      expected.push({ path, key: pathKey(path), after: clone(value) });
    };
    const applyPayload = async (payload, source) => {
      const result = component.loadFromPayload(payload, {
        source,
        reason: `persistence-matrix-${source}`,
        tab: activeTab,
        tabId: activeTab.id,
        skipDraw: true
      });
      if (result && typeof result.then === 'function') await result;
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    const capturePayload = reason => clone(component.getPayload({
      tab: activeTab,
      tabId: activeTab.id,
      reason
    }));
    const compare = (payload, candidates) => candidates
      .filter(candidate => !same(getAtPath(payload, candidate.path), candidate.after))
      .map(candidate => ({
        path: candidate.key,
        expected: candidate.after,
        actual: clone(getAtPath(payload, candidate.path))
      }));
    const requiresDirectHydration = candidate => (
      /^(?:config\.axis\.(?:strokeWidth|color|(?:tickInterval|majorTickLength|minorTicks|minorTickSubdivisions|notation)[XYZ]?)(?:\.|$)|style\.upset\.(?:axis|[xy]MajorTickLength)|config\.(?:title|[xyz]Label|notes)(?:\.|$)|style\.(?:title|notes)(?:\.|$)|notes(?:\.|$))/i
        .test(candidate.key)
    );
    const archivePayload = async snapshotKind => {
      window.Main.session.persistActiveTabState(activeTab, {
        workspaces: window.Main.components.registry,
        previews: window.Main.previews,
        reason: `persistence-matrix-${snapshotKind}-persist`
      });
      const context = window.Main.tabs.getSessionActionsContext();
      const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
        scope: 'workspace',
        snapshotKind,
        policyMode: snapshotKind === 'recovery' ? 'recovery' : 'manual-save',
        reason: `persistence-matrix-${snapshotKind}`,
        compression: 'STORE',
        useWorker: false
      });
      const parsed = await window.Shared.graphArchive.parseFile(blob, {
        fileName: snapshotKind === 'recovery' ? 'recovery.graph' : 'document.graph'
      });
      return clone(parsed.session.tabs.find(tab => tab.type === componentType)?.payload || null);
    };

    const baseline = capturePayload('persistence-matrix-baseline');
    const candidates = [];
    const classified = [];
    parameterRoots.forEach(root => {
      const value = baseline?.[root];
      if (value === undefined) {
        classified.push({ path: root, reason: 'missing-root' });
      } else {
        collect(value, [root], candidates, classified);
      }
    });
    const mutated = clone(baseline);
    candidates.forEach(candidate => setAtPath(mutated, candidate.path, candidate.after));
    await applyPayload(mutated, 'sentinel-hydration');
    const hydrated = capturePayload('persistence-matrix-hydrated');
    const hydrationMismatches = compare(hydrated, candidates);
    const requiredHydrationMismatches = hydrationMismatches.filter(item => {
      const candidate = candidates.find(entry => entry.key === item.path);
      return candidate && requiresDirectHydration(candidate);
    });

    const effectiveCandidates = [];
    parameterRoots.forEach(root => collectExpectedLeaves(hydrated?.[root], [root], effectiveCandidates));
    const documentPayload = await archivePayload('document-snapshot');
    const documentMismatches = compare(documentPayload, effectiveCandidates);
    const recoveryPayload = await archivePayload('recovery');
    const recoveryArchiveMismatches = compare(recoveryPayload, effectiveCandidates);

    await applyPayload(component.createEmptyPayload(), 'document-reset');
    await applyPayload(documentPayload, 'document-reopen');
    const reopenedMismatches = compare(capturePayload('persistence-matrix-reopened'), effectiveCandidates);

    await applyPayload(component.createEmptyPayload(), 'recovery-reset');
    await applyPayload(recoveryPayload, 'recovery-restore');
    const recoveredMismatches = compare(capturePayload('persistence-matrix-recovered'), effectiveCandidates);

    const baselineOnly = classified.filter(item => item.reason === 'baseline-only');
    return {
      candidateCount: candidates.length,
      roundTripFieldCount: effectiveCandidates.length,
      classifiedCount: classified.length,
      baselineOnly,
      hydrationMismatches,
      requiredHydrationMismatches,
      documentMismatches,
      recoveryArchiveMismatches,
      reopenedMismatches,
      recoveredMismatches
    };
  }, { componentType: type, parameterRoots: roots });
}

for (const componentCase of COMPONENT_MATRIX) {
  test(`${componentCase.type} graph parameters survive hydration, reopen, and recovery`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await openComponent(page, componentCase);
    const result = await auditComponent(page, componentCase.type, PARAMETER_ROOTS[componentCase.type]);
    await testInfo.attach(`${componentCase.type}-persistence-matrix.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    });
    expect(result.candidateCount, `${componentCase.type}: no graph parameters were exercised`).toBeGreaterThan(0);
    expect(result.requiredHydrationMismatches, `${componentCase.type}: loader rejected core graph sentinels`).toEqual([]);
    expect(result.documentMismatches, `${componentCase.type}: manual archive lost fields`).toEqual([]);
    expect(result.recoveryArchiveMismatches, `${componentCase.type}: recovery archive lost fields`).toEqual([]);
    expect(result.reopenedMismatches, `${componentCase.type}: file reopen lost fields`).toEqual([]);
    expect(result.recoveredMismatches, `${componentCase.type}: recovery restore lost fields`).toEqual([]);
  });
}
