const {
  NODE_UNIT_TESTS,
  DOM_UNIT_TESTS,
  ARCHITECTURE_TESTS,
  STATISTICAL_ORACLE_TESTS
} = require('./test-support/jestLayerManifest.js');

module.exports = {
  maxWorkers: 4,
  projects: [
    {
      // Static architecture rules and generated-artifact checks run without
      // the application DOM or fake vendors. Runtime tests must not be
      // silently replaced by these rules.
      displayName: 'architecture',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/__tests__/setup/nodeGlobals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/nodeAfterEnv.js'],
      testMatch: ARCHITECTURE_TESTS.map(file => `<rootDir>/${file}`),
      testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']
    },
    {
      // Numerical differential tests are intentionally isolated so that the
      // required Python oracle is a visible lane boundary, not an accidental
      // subset of the broad application integration project.
      displayName: 'statistical-oracle',
      testEnvironment: 'jsdom',
      setupFiles: ['<rootDir>/__tests__/setup/globals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/afterEnv.js'],
      fakeTimers: {
        doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame']
      },
      testMatch: [
        ...STATISTICAL_ORACLE_TESTS.map(file => `<rootDir>/${file}`)
      ],
      testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']
    },
    {
      // Pure test-support contracts must not inherit the application DOM or
      // vendor stubs. Add migrated unit suites here incrementally.
      displayName: 'unit-node',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/__tests__/setup/nodeGlobals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/nodeAfterEnv.js'],
      testMatch: [
        '<rootDir>/__tests__/unit/**/*.test.js',
        ...NODE_UNIT_TESTS.map(file => `<rootDir>/${file}`)
      ],
      testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']
    },
    {
      // DOM projection tests use only their declared fixture markup. They do
      // not parse index.html or install the full application bootstrap.
      displayName: 'dom-unit',
      testEnvironment: 'jsdom',
      setupFiles: ['<rootDir>/__tests__/setup/domGlobals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/domAfterEnv.js'],
      fakeTimers: {
        doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame']
      },
      testMatch: [
        '**/__tests__/dom/**/*.test.js',
        ...DOM_UNIT_TESTS.map(file => `<rootDir>/${file}`)
      ],
      testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']
    },
    {
      // Integration project: all tests that need the full jsdom + index.html environment.
      displayName: 'integration',
      testEnvironment: 'jsdom',
      setupFiles: ['<rootDir>/__tests__/setup/globals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/afterEnv.js'],
      // The integration environment installs a deterministic zero-delay RAF backed by
      // setTimeout. Keep that RAF when tests enable fake timers; Jest otherwise replaces
      // it with frame-clock semantics, while the timer-driven tests intentionally flush
      // one coalesced live frame with advanceTimersByTime(0).
      fakeTimers: {
        doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame']
      },
      testMatch: ['**/__tests__/**/*.test.js'],
      testPathIgnorePatterns: [
        '<rootDir>/.claude/worktrees/',
        '<rootDir>/__tests__/workers/',
        '<rootDir>/__tests__/unit/',
        '<rootDir>/__tests__/dom/',
        ...NODE_UNIT_TESTS.map(file => `<rootDir>/${file}`),
        ...DOM_UNIT_TESTS.map(file => `<rootDir>/${file}`),
        ...ARCHITECTURE_TESTS.map(file => `<rootDir>/${file}`),
        ...STATISTICAL_ORACLE_TESTS.map(file => `<rootDir>/${file}`),
      ]
    },
    {
      // Workers project: web-worker tests that run in a plain Node env.
      // No afterEnv means no index.html load before every test.
      displayName: 'workers',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/workers/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']
    }
  ],
  collectCoverageFrom: [
    'js/**/*.js',
    'src/**/*.js'
  ],
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 15,
      functions: 25,
      lines: 25
    }
  }
};
