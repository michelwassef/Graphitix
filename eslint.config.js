'use strict';

const globals = require('globals');

const sourceFiles = ['js/**/*.js', 'scripts/**/*.{js,cjs}', 'test-support/**/*.js'];
const testFiles = ['__tests__/**/*.js', 'e2e/**/*.js', 'test-support/uiEventsSuite.js', 'test-support/hotAggridClipboardSuite.js', 'test-support/componentLifecycleCoreSuite.js', 'test-support/hotAggridBindingSuite.js', 'test-support/sessionAssignTabPayloadSuite.js'];
const testGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.jest,
  waitFor: 'readonly',
  __GRID_CALLS__: 'readonly',
  __resetGrid__: 'readonly',
  __clearUnexpectedConsoleErrors: 'readonly',
  __consumeUnexpectedConsoleErrors: 'readonly',
  __isStrictConsoleErrorsEnabled: 'readonly',
  Shared: 'readonly'
};

const correctnessRules = {
  'array-callback-return': 'error',
  'constructor-super': 'error',
  'for-direction': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-class-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-constant-binary-expression': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-else-if': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-empty-character-class': 'error',
  'no-ex-assign': 'error',
  'no-extra-boolean-cast': 'error',
  'no-fallthrough': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-invalid-regexp': 'error',
  'no-irregular-whitespace': 'error',
  'no-loss-of-precision': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-obj-calls': 'error',
  'no-promise-executor-return': 'error',
  'no-prototype-builtins': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-setter-return': 'error',
  'no-sparse-arrays': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-undef': 'error',
  'no-unused-labels': 'error',
  'no-unused-private-class-members': 'error',
  'no-useless-backreference': 'error',
  'no-useless-catch': 'error',
  'no-useless-escape': 'off',
  'require-yield': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
};

const testCorrectnessRules = {
  ...correctnessRules,
  // Existing test delays intentionally return setTimeout's handle from a
  // Promise executor. It is harmless, and its migration belongs with the
  // fixed-wait cleanup rather than this syntax/ownership gate.
  'no-promise-executor-return': 'off'
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'desktop/app/**',
      'desktop/dist/**',
      '_site/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'artifacts/**',
      'benchmarks/**',
      'libs/**'
    ]
  },
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.worker, ...globals.node }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    rules: {
      ...correctnessRules,
      'no-unused-vars': ['error', {
        vars: 'all',
        args: 'none',
        caughtErrors: 'none',
        ignoreRestSiblings: true
      }],
      'no-with': 'error'
    }
  },
  {
    // Test code is intentionally linted with the globals supplied by its
    // runner. Unused-variable cleanup is a later migration because many old
    // fixtures deliberately expose callback-shaped arguments.
    files: testFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: testGlobals
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    rules: testCorrectnessRules
  }
];
