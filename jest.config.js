module.exports = {
  projects: [
    {
      // Integration project: all tests that need the full jsdom + index.html environment.
      displayName: 'integration',
      testEnvironment: 'jsdom',
      setupFiles: ['<rootDir>/__tests__/setup/globals.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/afterEnv.js'],
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
    'src/**/*.js',
    '!js/utils.js'
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

