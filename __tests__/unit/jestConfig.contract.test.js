'use strict';

const jestConfig = require('../../jest.config.js');

function project(name) {
  return jestConfig.projects.find(entry => entry.displayName === name);
}

describe('Jest project boundaries', () => {
  test('declares the six supported test layers', () => {
    expect(jestConfig.projects.map(entry => entry.displayName)).toEqual([
      'architecture',
      'statistical-oracle',
      'unit-node',
      'dom-unit',
      'integration',
      'workers'
    ]);
  });

  test('keeps RAF outside fake timers in DOM and integration projects', () => {
    for (const name of ['dom-unit', 'integration']) {
      expect(project(name).fakeTimers.doNotFake).toEqual(
        expect.arrayContaining(['requestAnimationFrame', 'cancelAnimationFrame'])
      );
    }
  });

  test('keeps DOM-unit setup separate from the full application setup', () => {
    const domUnit = project('dom-unit');
    expect(domUnit.testEnvironment).toBe('jsdom');
    expect(domUnit.setupFiles).toEqual(['<rootDir>/__tests__/setup/domGlobals.js']);
    expect(domUnit.setupFilesAfterEnv).toEqual(['<rootDir>/__tests__/setup/domAfterEnv.js']);
    expect(domUnit.testMatch).toContain('**/__tests__/dom/**/*.test.js');
  });
});
