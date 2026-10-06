'use strict';

const fs = require('fs');
const path = require('path');
const { buildMap, collectSymbolReferences } = require('../../scripts/generate-architecture-map');

const ROOT = path.resolve(__dirname, '../..');

describe('generated module call map coverage', () => {
  test('includes bootstrap files, every worker entry, and literal worker consumers', () => {
    const modules = buildMap();
    const modulePaths = new Set(modules.map(module => module.rel));
    const workerEntries = fs.readdirSync(path.join(ROOT, 'js', 'workers'))
      .filter(file => file.endsWith('.js'))
      .map(file => `js/workers/${file}`)
      .sort();

    expect(modulePaths.has('js/main.js')).toBe(true);
    expect(modulePaths.has('js/vendor.js')).toBe(true);
    workerEntries.forEach(worker => expect(modulePaths.has(worker)).toBe(true));

    const consumers = new Set(modules.flatMap(module => module.workerRefs));
    expect(Array.from(consumers).sort()).toEqual(workerEntries);
    expect(modules.find(module => module.rel === 'js/components/box.js').workerRefs)
      .toContain('js/workers/box.worker.js');
  });

  test('captures optional chains, static computed properties, and namespace destructuring', () => {
    const source = [
      'const { graphArchive: archive } = window.Shared;',
      'Shared?.workspaceTabs?.getMountedRoot?.();',
      "window.Shared['componentLifecycle']?.restore?.();",
      'const { session } = window.Main;',
      'Main?.components?.registry?.[type];',
      "const text = 'Components.notAReference';",
      '// Shared.notAReference'
    ].join('\n');

    expect(collectSymbolReferences(source, 'Shared').symbols).toEqual([
      'componentLifecycle', 'graphArchive', 'workspaceTabs'
    ]);
    expect(collectSymbolReferences(source, 'Main').symbols).toEqual(['components', 'session']);
    expect(collectSymbolReferences(source, 'Components').symbols).toEqual([]);
  });
});
