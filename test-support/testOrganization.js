'use strict';

const LARGE_TEST_LINE_LIMIT = 800;

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function classifyTestOrganization(file) {
  const normalized = normalizePath(file);
  if (normalized.startsWith('__tests__/')) {
    const segments = normalized.split('/');
    if (segments.length > 2) {
      return { root: 'jest', group: segments[1] };
    }
    return { root: 'jest', group: 'legacy-root' };
  }
  if (normalized.startsWith('e2e/')) {
    const segments = normalized.split('/');
    if (segments.length > 2) {
      return { root: 'playwright', group: segments[1] };
    }
    return { root: 'playwright', group: 'legacy-root' };
  }
  return { root: 'unknown', group: 'unknown' };
}

function summarizeTestOrganization(records = []) {
  const suites = records.map(record => {
    const file = normalizePath(record.file);
    const organization = classifyTestOrganization(file);
    return {
      file,
      lines: Number(record.lines) || 0,
      root: organization.root,
      group: organization.group
    };
  });
  const oversized = suites.filter(suite => suite.lines > LARGE_TEST_LINE_LIMIT);
  return {
    largeLineLimit: LARGE_TEST_LINE_LIMIT,
    suiteCount: suites.length,
    organized: suites.filter(suite => suite.group !== 'legacy-root').length,
    legacyRoot: suites.filter(suite => suite.group === 'legacy-root').length,
    oversized,
    oversizedLegacyRoot: oversized.filter(suite => suite.group === 'legacy-root')
  };
}

function validateTestOrganization(organization) {
  if (!organization || !Array.isArray(organization.oversizedLegacyRoot)) {
    return ['test organization inventory is incomplete'];
  }
  if (organization.oversizedLegacyRoot.length > 0) {
    return [
      `oversized test suites must be grouped outside a test root: ${organization.oversizedLegacyRoot.map(suite => suite.file).join(', ')}`
    ];
  }
  return [];
}

module.exports = {
  LARGE_TEST_LINE_LIMIT,
  classifyTestOrganization,
  summarizeTestOrganization,
  validateTestOrganization
};
