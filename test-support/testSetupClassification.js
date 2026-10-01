'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REVIEWED_SUITE_SETUP = Object.freeze({
  'e2e/diagnostics/vendor.runtime.smoke.spec.js':
    'Checks committed browser vendor globals directly; it has no component UI or owner-payload setup.'
});

const UI_DRIVER_CALL = /\b(?:openComponentFromWelcome|clickExpectedExampleButton|clickExampleButton|activateTab|activateToolbarSection|importDataFile|confirmDataImportPrompt)\s*\(/;
const PLAYWRIGHT_LOCATOR = /\bpage\.(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)\s*\(/;
const PLAYWRIGHT_ACTION = /\.(?:click|fill|check|uncheck|selectOption|press|dragTo|hover|setInputFiles)\s*\(/;
const API_DRIVER_CALL = /\b(?:installOwnerPayloadDriver|buildWorkspaceArchive|openWorkspaceArchive(?:Buffer)?|parseWorkspaceArchive|saveWorkspaceArchive|seedRecoveryArchive|reloadAndAcceptRecovery|requestRecoveryCheckpoint|clearRecoverySnapshot)\s*\(/;
const APP_API_ACCESS = /\b(?:window|globalThis)\s*(?:\?\.|\.)\s*(?:Main|Components|Shared)\b/;
const APP_API_MUTATION = /\b(?:window|globalThis)\s*(?:\?\.|\.)\s*(?:Main|Components|Shared)\b(?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*){0,3}\s*(?:\?\.|\.)\s*(?:set[A-Z]\w*|loadFromPayload|applyPayload|persistActiveTabState|applyRuntimeState|restore[A-Z]\w*|hydrate[A-Z]\w*|mutate[A-Z]\w*|activateTab|openArchive|importDataFile|build[A-Z]\w*)\s*\(/;

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function inferBrowserSetupClassification(file, rootDir = REPO_ROOT) {
  const normalized = normalizePath(file);
  const absolutePath = path.isAbsolute(file) ? file : path.resolve(rootDir, normalized);
  if (!fs.existsSync(absolutePath)) {
    return {
      classification: 'declared-in-suite',
      evidence: ['source-unavailable']
    };
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const evidence = [];
  const hasLocator = PLAYWRIGHT_LOCATOR.test(source);
  const hasUiDriver = UI_DRIVER_CALL.test(source);
  const hasUiAction = PLAYWRIGHT_ACTION.test(source);
  const hasUi = hasUiDriver || (hasLocator && (hasUiAction
    || /\bexpect\s*\(\s*page\.(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)\s*\(/.test(source)));
  const hasApiDriver = API_DRIVER_CALL.test(source)
    || /\bGraphitixOwnerPayloadDriver\b/.test(source);
  const hasAppApi = APP_API_ACCESS.test(source);
  const hasAppMutation = APP_API_MUTATION.test(source);

  if (hasUiDriver) evidence.push('ui:shared-playwright-driver');
  if (hasLocator && (hasUiAction || /\bexpect\s*\(\s*page\.(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)\s*\(/.test(source))) {
    evidence.push('ui:playwright-locator-contract');
  }
  if (hasApiDriver) evidence.push('api:owner-archive-or-recovery-driver');
  if (hasAppMutation) evidence.push('api:application-state-mutation');
  else if (hasAppApi && !hasUi) evidence.push('api:application-namespace-contract');

  const hasApi = evidence.some(item => item.startsWith('api:'));
  if (hasUi && hasApi) return { classification: 'mixed', evidence };
  if (hasUi) return { classification: 'ui', evidence };
  if (hasApi) return { classification: 'api', evidence };

  const reviewedReason = REVIEWED_SUITE_SETUP[normalized];
  if (reviewedReason) {
    return {
      classification: 'declared-in-suite',
      evidence: [`reviewed-in-suite:${reviewedReason}`]
    };
  }
  return {
    classification: 'declared-in-suite',
    evidence: ['no-recognized-ui-or-api-setup']
  };
}

module.exports = {
  REVIEWED_SUITE_SETUP,
  inferBrowserSetupClassification
};
