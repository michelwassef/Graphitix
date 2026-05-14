module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/__tests__/setup/globals.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/afterEnv.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/worktrees/'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.claude/worktrees/'
  ]
};

