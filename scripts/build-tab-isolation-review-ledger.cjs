#!/usr/bin/env node
'use strict';

// Persist manual source-trace decisions beside the scanner's current candidate
// set. Scanner cues organize review; they never assign a safety disposition.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const scanner = path.join(__dirname, 'audit-tab-leak-surfaces.cjs');
const ledgerArgumentIndex = process.argv.indexOf('--ledger');
const ledgerOverride = ledgerArgumentIndex >= 0 ? process.argv[ledgerArgumentIndex + 1] : '';
const ledgerPath = ledgerOverride
  ? path.resolve(root, ledgerOverride)
  : path.join(root, 'docs/development/tab-isolation-candidate-ledger.json');
const checkOnly = process.argv.includes('--check');
const helperDepthArgument = process.argv.find(arg => arg.startsWith('--helper-depth='));

function candidateId(item) {
  return `${item.file}:${item.line}:${item.callback}`;
}

function candidateIdentity(item) {
  return item.sourceHash
    ? `${item.file}:${item.kind}:${item.callback}:${item.sourceHash}`
    : '';
}

function reviewBucket(item) {
  if (item.file.startsWith('js/main/') || item.file.startsWith('js/shared/')) {
    return 'shared-control-plane';
  }
  if (item.activeReadsAfterAwait?.length) return 'async-owner';
  if (item.externalSinks?.length) return 'durable-external-sink';
  const writes = [...(item.capturedWrites || []), ...(item.helperWrites || [])];
  if (writes.some(write => write.scopeDepth === 1)) return 'module-scope-write';
  if (writes.some(write => write.scopeDepth === 2)) return 'enclosing-scope-write';
  if (item.helperWrites?.length) return 'local-helper-sink';
  return 'other';
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function readPreviousLedger() {
  if (!fs.existsSync(ledgerPath)) return { candidates: [], retired: [] };
  const previous = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (previous.version !== 1 || !Array.isArray(previous.candidates)) {
    throw new Error(`Unsupported ledger format: ${path.relative(root, ledgerPath)}`);
  }
  return previous;
}

const scanArguments = [scanner, '--json', '--all'];
if (helperDepthArgument) scanArguments.push(helperDepthArgument);
const scan = JSON.parse(execFileSync(process.execPath, scanArguments, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
}));
const previous = readPreviousLedger();
const previousById = new Map(previous.candidates.map(item => [item.id, item]));
const priorIdentityGroups = new Map();
[...(previous.retired || []), ...previous.candidates].forEach(item => {
  const identity = item.identity || candidateIdentity(item.source || {});
  if (!identity) return;
  const matches = priorIdentityGroups.get(identity) || [];
  matches.push(item);
  priorIdentityGroups.set(identity, matches);
});
const seen = new Set();
const candidates = scan.findings.map(item => {
  const id = candidateId(item);
  if (seen.has(id)) throw new Error(`Duplicate scanner candidate id: ${id}`);
  seen.add(id);
  const identity = candidateIdentity(item);
  const identityMatches = identity ? (priorIdentityGroups.get(identity) || []) : [];
  const matchedReview = identityMatches.length > 0
    && identityMatches.every(candidate => JSON.stringify(candidate.review) === JSON.stringify(identityMatches[0].review))
    ? identityMatches[0]
    : null;
  const exactPrior = previousById.get(id);
  const prior = exactPrior && (!exactPrior.identity || exactPrior.identity === identity)
    ? exactPrior
    : matchedReview;
  return {
    id,
    identity,
    bucket: reviewBucket(item),
    cues: {
      triageBand: item.triageBand || 'unranked',
      triageScore: Number.isFinite(item.triageScore) ? item.triageScore : null,
      triageReasons: item.triageReasons || [],
      registrationSites: item.registrationSites || [],
      awaitCount: Number.isFinite(item.awaitCount) ? item.awaitCount : 0,
      activeLookupAfterAwait: item.activeReadsAfterAwait || [],
      moduleScopeWrites: [...(item.capturedWrites || []), ...(item.helperWrites || [])]
        .filter(write => write.scopeDepth === 1),
      localHelperWrites: item.helperWrites || [],
      externalSinks: item.externalSinks || [],
      noOwnerMetadataClue: !item.ownerMetadataPresent,
      noInlineOwnerCheck: !item.ownerCheckPresent,
      knownOwnerWrapper: !!item.ownerWrapperPresent
    },
    source: item,
    review: prior?.review || {
      status: 'pending source trace',
      ownerPath: '',
      finalSink: '',
      evidence: '',
      boundedTest: '',
      reviewedAt: ''
    }
  };
});

const currentIds = new Set(candidates.map(item => item.id));
const retired = [
  ...(previous.retired || []),
  ...previous.candidates
    .filter(item => !currentIds.has(item.id))
    .map(item => ({ ...item, retirement: 'candidate no longer emitted; recheck before closing' }))
];
const bucketCounts = Object.fromEntries([...new Set(candidates.map(item => item.bucket))]
  .sort()
  .map(bucket => [bucket, candidates.filter(item => item.bucket === bucket).length]));
const dispositionCounts = Object.fromEntries([...new Set(candidates.map(item => item.review.status))]
  .sort()
  .map(status => [status, candidates.filter(item => item.review.status === status).length]));
const ledger = {
  version: 1,
  generatedAt: new Date().toISOString(),
  scannerSummary: scan.summary,
  bucketCounts,
  dispositionCounts,
  caveat: 'Buckets and cues prioritize manual review; file-save sink selectors are static risk cues only. Only source tracing and bounded runtime evidence establish safety or a defect.',
  candidates,
  retired
};

if (checkOnly) {
  const existing = readPreviousLedger();
  const existingIds = new Set(existing.candidates.map(item => item.id));
  const missing = candidates.filter(item => !existingIds.has(item.id)).length;
  const stale = existing.candidates.filter(item => !currentIds.has(item.id)).length;
  const identityOrSourceDrift = candidates.filter(item => {
    const prior = previousById.get(item.id);
    return prior && (
      prior.identity !== item.identity
      || prior.bucket !== item.bucket
      || stableStringify(prior.cues) !== stableStringify(item.cues)
      || stableStringify(prior.source) !== stableStringify(item.source)
    );
  }).length;
  const actualDispositionCounts = countBy(existing.candidates, item => item.review?.status || '(missing status)');
  const actualBucketCounts = countBy(existing.candidates, item => item.bucket || '(missing bucket)');
  const dispositionSummaryDrift = stableStringify(existing.dispositionCounts || {})
    !== stableStringify(actualDispositionCounts);
  const bucketSummaryDrift = stableStringify(existing.bucketCounts || {})
    !== stableStringify(actualBucketCounts);
  const scannerSummaryDrift = stableStringify(existing.scannerSummary || {})
    !== stableStringify(scan.summary || {});
  const problems = missing || stale || identityOrSourceDrift
    || dispositionSummaryDrift || bucketSummaryDrift || scannerSummaryDrift;
  process.stdout.write([
    `Current candidates: ${candidates.length}`,
    `missing from ledger: ${missing}`,
    `stale entries to recheck: ${stale}`,
    `changed source rows: ${identityOrSourceDrift}`,
    `disposition counts stale: ${dispositionSummaryDrift}`,
    `bucket counts stale: ${bucketSummaryDrift}`,
    `scanner summary stale: ${scannerSummaryDrift}`
  ].join('; ') + '.\n');
  process.exitCode = problems ? 1 : 0;
} else {
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`Updated ${path.relative(root, ledgerPath)} with ${candidates.length} candidates.\n`);
}
