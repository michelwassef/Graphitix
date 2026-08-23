module.exports = {
  maxWorkers: 4,
  projects: [
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
        '<rootDir>/__tests__/workers/'
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
