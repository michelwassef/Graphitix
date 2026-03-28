const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  exerciseVisibleComponentControls,
  collectComponentPerformanceSnapshot,
  shouldIgnoreConsoleEntry
} = require('./helpers/workspaceHarness');

function writePerfSummary(fileName, payload) {
  const outDir = path.resolve('artifacts', 'perf-summaries');
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, fileName);
  const data = JSON.stringify(payload, null, 2);
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      fs.writeFileSync(target, data, 'utf8');
      return;
    } catch (err) {
      lastError = err;
      const code = String(err?.code || '');
      if (code !== 'EBUSY' && code !== 'EACCES' && code !== 'UNKNOWN') {
        break;
      }
      const start = Date.now();
      while (Date.now() - start < (attempt + 1) * 120) { /* retry backoff */ }
    }
  }
  console.warn('workspace exercise perf summary write skipped', { fileName, error: lastError?.message || String(lastError) });
}

test.describe('Workspace Stress Matrix', () => {
  test('opens all components and loads all example datasets in one workspace session', async ({ page }, testInfo) => {
    test.setTimeout(9 * 60 * 1000);
    const issues = registerIssueCollectors(page);
    const report = [];
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    for (let index = 0; index < COMPONENT_MATRIX.length; index += 1) {
      const component = COMPONENT_MATRIX[index];
      await test.step(`open and load example: ${component.type}`, async () => {
        const openStart = Date.now();
        await openComponentFromWelcome(page, component, { first: index === 0 });
        const openMs = Date.now() - openStart;
        const exampleStart = Date.now();
        const exampleLoaded = await clickExampleButtonIfPresent(page, component.exampleButtonId);
        const exampleMs = Date.now() - exampleStart;
        const perfSnapshot = await collectComponentPerformanceSnapshot(page, component.type);
        report.push({
          component: component.type,
          page: component.pageId,
          exampleLoaded,
          openMs,
          exampleMs,
          perf: {
            componentReport: perfSnapshot?.sharedPerformance?.componentReport || [],
            hotReport: perfSnapshot?.sharedPerformance?.hotReport || [],
            componentHook: perfSnapshot?.componentHook || null
          }
        });
        await page.waitForTimeout(220);
      });
    }

    const critical = issues.critical;
    await testInfo.attach('workspace-all-components-summary.json', {
      body: Buffer.from(JSON.stringify({
        browser: testInfo.project.name,
        report,
        totals: {
          logEntries: issues.all.length,
          critical: critical.length
        },
        criticalEntries: critical.slice(0, 30)
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    writePerfSummary(`all-components-${testInfo.project.name}.json`, {
      browser: testInfo.project.name,
      report,
      totals: {
        logEntries: issues.all.length,
        critical: critical.length
      },
      criticalEntries: critical.slice(0, 30)
    });

    expect(critical, `Critical browser issues found: ${JSON.stringify(critical.slice(0, 5), null, 2)}`).toEqual([]);
  });

  for (const component of COMPONENT_MATRIX) {
    test(`stress interactions: ${component.type}`, async ({ page }, testInfo) => {
      test.setTimeout(3 * 60 * 1000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);

      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible();
      const openStart = Date.now();
      await openComponentFromWelcome(page, component, { first: true });
      const openMs = Date.now() - openStart;
      const exampleStart = Date.now();
      const exampleLoaded = await clickExampleButtonIfPresent(page, component.exampleButtonId);
      const exampleMs = Date.now() - exampleStart;
      const perfBeforeExercise = await collectComponentPerformanceSnapshot(page, component.type);
      const exerciseStart = Date.now();
      const exerciseDetails = await exerciseVisibleComponentControls(page, component);
      const exerciseMs = Date.now() - exerciseStart;
      const perfAfterExercise = await collectComponentPerformanceSnapshot(page, component.type);
      const slowestSteps = (exerciseDetails?.steps || [])
        .slice()
        .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
        .slice(0, 5);

      const warningEntries = issues.all.filter(entry => entry.type === 'warning');
      const errorEntries = issues.all.filter(entry => entry.type === 'error');
      const ignoredErrors = errorEntries.filter(entry => shouldIgnoreConsoleEntry(entry.text));
      const critical = issues.critical;

      await testInfo.attach(`workspace-component-${component.type}-summary.json`, {
        body: Buffer.from(JSON.stringify({
          browser: testInfo.project.name,
          component: component.type,
          page: component.pageId,
          exampleLoaded,
          timingsMs: {
            openMs,
            exampleMs,
            exerciseMs
          },
          totals: {
            logEntries: issues.all.length,
            warnings: warningEntries.length,
            errors: errorEntries.length,
            ignoredErrors: ignoredErrors.length,
            critical: critical.length
          },
          perf: {
            beforeExercise: perfBeforeExercise,
            afterExercise: perfAfterExercise,
            exercise: exerciseDetails,
            slowestSteps
          },
          criticalEntries: critical.slice(0, 30)
        }, null, 2), 'utf8'),
        contentType: 'application/json'
      });
      writePerfSummary(`component-${component.type}-${testInfo.project.name}.json`, {
        browser: testInfo.project.name,
        component: component.type,
        page: component.pageId,
        exampleLoaded,
        timingsMs: {
          openMs,
          exampleMs,
          exerciseMs
        },
        totals: {
          logEntries: issues.all.length,
          warnings: warningEntries.length,
          errors: errorEntries.length,
          ignoredErrors: ignoredErrors.length,
          critical: critical.length
        },
        perf: {
          beforeExercise: perfBeforeExercise,
          afterExercise: perfAfterExercise,
          exercise: exerciseDetails,
          slowestSteps
        },
        criticalEntries: critical.slice(0, 30)
      });

      expect(critical, `Critical browser issues found: ${JSON.stringify(critical.slice(0, 5), null, 2)}`).toEqual([]);
    });
  }
});
