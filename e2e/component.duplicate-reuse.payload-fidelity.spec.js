const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForActiveTabPayload(page) {
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state?.activeTabId);
    return !!(active && active.payload && typeof active.payload === 'object');
  }, null, { timeout: 20_000 });
}

async function duplicateWithReuse(page, componentType, pageId) {
  await page.evaluate(async (type) => {
    const tabs = window.Main?.tabs;
    const maybeAdd = tabs?.handleAddTabClick?.();
    if (maybeAdd && typeof maybeAdd.then === 'function') await maybeAdd;
    const maybeSelect = tabs?.handleGraphSelection?.(type, { reason: 'e2e-duplicate-reuse' });
    if (maybeSelect && typeof maybeSelect.then === 'function') await maybeSelect;
  }, componentType);
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector(`#${pageId}:not([hidden])`, { timeout: 20_000 });
}

async function captureDuplicatePayloadComparison(page, sourceTabId) {
  return page.evaluate((sourceId) => {
    const state = window.Main?.session?.workspaceState;
    const duplicateTabId = state?.activeTabId || null;
    const sourceTab = state?.tabs?.find(tab => tab?.id === sourceId) || null;
    const duplicateTab = state?.tabs?.find(tab => tab?.id === duplicateTabId) || null;

    const canonicalPayload = value => {
      const clone = value == null ? null : JSON.parse(JSON.stringify(value));
      const isBlankCell = cell => cell === null || cell === undefined || String(cell) === '';
      const trimMatrix = matrix => {
        if (!Array.isArray(matrix)) return matrix;
        const trimRow = row => {
          if (!Array.isArray(row)) return row;
          let end = row.length;
          while (end > 0 && isBlankCell(row[end - 1])) {
            end -= 1;
          }
          return row.slice(0, end).map(cell => isBlankCell(cell) ? '' : cell);
        };
        const rows = matrix.map(trimRow);
        let end = rows.length;
        while (end > 0 && Array.isArray(rows[end - 1]) && rows[end - 1].every(isBlankCell)) {
          end -= 1;
        }
        const compactRows = rows.slice(0, end);
        const bodyRows = compactRows.slice(1).filter(Array.isArray);
        if (bodyRows.length > 0) {
          let maxDataCol = -1;
          bodyRows.forEach(row => {
            row.forEach((cell, index) => {
              if (!isBlankCell(cell)) {
                maxDataCol = Math.max(maxDataCol, index);
              }
            });
          });
          if (maxDataCol >= 0) {
            return compactRows.map(row => Array.isArray(row) ? row.slice(0, maxDataCol + 1) : row);
          }
        }
        return compactRows;
      };
      const normalizeEmptyGeneratedMaps = node => {
        if (!node || typeof node !== 'object') return;
        if (node.seriesStyles && typeof node.seriesStyles === 'object' && !Array.isArray(node.seriesStyles)) {
          Object.keys(node.seriesStyles).forEach(key => {
            const style = node.seriesStyles[key];
            if (!style || (typeof style === 'object' && !Array.isArray(style) && Object.keys(style).length === 0)) {
              delete node.seriesStyles[key];
            }
          });
          if (Object.keys(node.seriesStyles).length === 0) {
            delete node.seriesStyles;
          }
        }
      };
      const strip = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.data)) {
          node.data = trimMatrix(node.data);
        }
        normalizeEmptyGeneratedMaps(node);
        delete node.meta;
        delete node.createdAt;
        delete node.updatedAt;
        delete node.stats;
        delete node.results;
        delete node.resultsModel;
        delete node.reportModel;
        delete node.statsPanel;
        delete node.statsPanelModel;
        delete node.parallelAnalysis;
        delete node.viewportGeometry;
        delete node.graphGeometry;
        delete node.contextSignature;
        delete node.contextVersion;
        Object.values(node).forEach(child => {
          if (Array.isArray(child)) {
            child.forEach(strip);
          } else {
            strip(child);
          }
        });
      };
      strip(clone);
      if (clone?.type === 'venn' && clone.analysis) {
        // Automatic species recognition may finish after the duplicate snapshot.
        // Dedicated Venn persistence coverage asserts explicit species state.
        delete clone.analysis.speciesValue;
        delete clone.analysis.speciesIndicator;
      }
      return clone;
    };

    const safeJson = value => {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return null;
      }
    };
    const diffPaths = (left, right, prefix = '') => {
      if (safeJson(left) === safeJson(right)) return [];
      if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
        return [prefix || '<root>'];
      }
      const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]));
      const diffs = [];
      keys.forEach(key => {
        if (diffs.length >= 40) return;
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        diffs.push(...diffPaths(left[key], right[key], nextPrefix));
      });
      return diffs.slice(0, 40);
    };

    const sourceJson = safeJson(sourceTab?.payload || null);
    const duplicateJson = safeJson(duplicateTab?.payload || null);
    const sourcePayload = sourceJson ? JSON.parse(sourceJson) : null;
    const duplicatePayload = duplicateJson ? JSON.parse(duplicateJson) : null;
    const sourceCanonical = canonicalPayload(sourcePayload);
    const duplicateCanonical = canonicalPayload(duplicatePayload);

    const sourceData = sourcePayload?.data;
    const duplicateData = duplicatePayload?.data;
    const sourceHeaderRow = Array.isArray(sourceData?.[0]) ? sourceData[0] : null;
    const duplicateHeaderRow = Array.isArray(duplicateData?.[0]) ? duplicateData[0] : null;

    return {
      sourceTabId: sourceId,
      duplicateTabId,
      sourceType: sourceTab?.type || null,
      duplicateType: duplicateTab?.type || null,
      payloadJsonEqual: sourceJson === duplicateJson,
      canonicalPayloadJsonEqual: safeJson(sourceCanonical) === safeJson(duplicateCanonical),
      canonicalDiffPaths: diffPaths(sourceCanonical, duplicateCanonical),
      sourcePayload,
      duplicatePayload,
      sourceCanonical,
      duplicateCanonical,
      sourceHeaderRow,
      duplicateHeaderRow
    };
  }, sourceTabId);
}

for (const component of COMPONENT_MATRIX) {
  test(`duplicate reuse payload fidelity for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await waitForActiveTabPayload(page);

    const sourceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(sourceTabId).toBeTruthy();

    await duplicateWithReuse(page, component.type, component.pageId);
    await waitForActiveTabPayload(page);
    await page.waitForFunction((sourceId) => {
      const state = window.Main?.session?.workspaceState;
      const source = state?.tabs?.find(tab => tab?.id === sourceId);
      return !!(source && source.payload && typeof source.payload === 'object');
    }, sourceTabId, { timeout: 20_000 });
    await page.waitForFunction((sourceId) => {
      const state = window.Main?.session?.workspaceState;
      const source = state?.tabs?.find(tab => tab?.id === sourceId);
      const duplicate = state?.tabs?.find(tab => tab?.id === state?.activeTabId);
      if (!source?.payload || !duplicate?.payload || source.id === duplicate.id) {
        return false;
      }
      const sourceType = source.payload.type || source.type || null;
      const duplicateType = duplicate.payload.type || duplicate.type || null;
      if (sourceType !== duplicateType) {
        return false;
      }
      if (sourceType === 'venn') {
        return !!duplicate.payload.data && !!duplicate.payload.style;
      }
      return true;
    }, sourceTabId, { timeout: 20_000 });

    const comparison = await captureDuplicatePayloadComparison(page, sourceTabId);
    await testInfo.attach(`${component.type}.duplicate-reuse.payload-comparison.json`, {
      body: Buffer.from(JSON.stringify(comparison, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(comparison.duplicateTabId).toBeTruthy();
    expect(comparison.duplicateTabId).not.toBe(sourceTabId);
    expect(comparison.sourceType).toBe(component.type);
    expect(comparison.duplicateType).toBe(component.type);
    expect(comparison.canonicalDiffPaths).toEqual([]);

    if (Array.isArray(comparison.sourceHeaderRow) || Array.isArray(comparison.duplicateHeaderRow)) {
      expect(comparison.duplicateHeaderRow).toEqual(comparison.sourceHeaderRow);
    }
    expect(issues.critical).toEqual([]);
  });
}
