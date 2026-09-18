const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('remaining audit fixes', () => {
  test('Venn snapshot readiness does not cancel automatic species detection', () => {
    const source = read('js/components/venn.js');
    const start = source.indexOf('venn.awaitReadyForSnapshot = function');
    const block = source.slice(start, start + 600);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).not.toContain('cancelAutomaticSpeciesDetectionForSnapshot');
    expect(source).not.toContain('automatic species detection cancelled for snapshot');
  });

  test('Venn species suppression is tied to the restored input signature', () => {
    const source = read('js/components/venn.js');
    const scheduleStart = source.indexOf('function scheduleSpeciesRecognition');
    const scheduleEnd = source.indexOf('\n  const ensureGraphViewport', scheduleStart);
    const scheduleBlock = source.slice(scheduleStart, scheduleEnd);
    const recognizeStart = source.indexOf('async function recognizeSpeciesFromInput');
    const recognizeEnd = source.indexOf('\n  function', recognizeStart + 20);
    const recognizeBlock = source.slice(recognizeStart, recognizeEnd);
    expect(scheduleBlock).not.toContain('storedSpecies');
    expect(recognizeBlock).toContain('shouldSuppressVennSpeciesRecognition(callbackOwner.session, genes)');
  });

  test('Pie validates saved correction values without building display metadata', () => {
    const source = read('js/components/pie.js');
    const start = source.indexOf('function sanitizePieStatsCorrection');
    const end = source.indexOf('\n  function formatPieStatNumber', start);
    const block = source.slice(start, end);
    expect(block).toContain('PIE_STATS_CORRECTION_KEY_SET.has(value)');
    expect(block).not.toContain('getPieCorrectionOptions()');
    expect(source).toContain('const PIE_STATS_CORRECTION_KEYS = Object.freeze');
    expect(source).toContain('const correctionOptions = getPieCorrectionOptions()');
  });

  test('routine shared diagnostics use the debug gate', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    const stats = read('js/shared/stats.js');
    expect((chartStyle.match(/console\.debug\(/g) || []).length).toBe(1);
    expect((stats.match(/console\.debug\(/g) || []).length).toBe(1);
    expect(chartStyle).toContain('function debugLog(message, payload)');
    expect(stats).toContain('function statsDebug(label, payload)');
  });

  test('welcome example retries component command readiness failures', () => {
    const source = read('js/main/tabs.js');
    expect(source).toContain("result?.reason === 'component-command-unavailable'");
  });
});
