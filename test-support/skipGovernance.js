'use strict';

const SKIP_POLICY_PATTERN = /\[skip-policy\s+issue=([A-Za-z0-9._-]+)\s+owner=([A-Za-z0-9._-]+)\s+expires=(\d{4}-\d{2}-\d{2})\s+gate=([A-Za-z0-9._-]+)\]/i;

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseSkipPolicy(text) {
  const match = String(text || '').match(SKIP_POLICY_PATTERN);
  if (!match || !isValidIsoDate(match[3])) return null;
  return {
    issueId: match[1],
    owner: match[2],
    expiresOn: match[3],
    removalGate: match[4]
  };
}

function hasSkipPolicy(text) {
  return parseSkipPolicy(text) !== null;
}

module.exports = {
  SKIP_POLICY_PATTERN,
  parseSkipPolicy,
  hasSkipPolicy
};
