#!/usr/bin/env node
'use strict';

// Orders pending candidates for efficient manual review. Route batches are
// navigation aids only: each candidate still needs its own owner-path trace.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const ledgerPath = path.join(root, 'docs/development/tab-isolation-candidate-ledger.json');

function allWrites(candidate){
  return [
    ...(candidate.source?.capturedWrites || []),
    ...(candidate.source?.helperWrites || [])
  ];
}

function durableCue(candidate){
  const durableName = /^(?:parameter:)?(?:workspaceState|payload|session|tab|tabs|runtimeState)$/i;
  return (candidate.source?.externalSinks || []).length > 0
    || allWrites(candidate).some(write => durableName.test(write.name || ''));
}

function isGlobalCallback(candidate){
  return (candidate.source?.registrationSites || []).some(site => site.target === 'global event target');
}

function reviewSignals(candidate){
  const awaitCount = Number(candidate.cues?.awaitCount) || 0;
  const activeAfterAwait = (candidate.cues?.activeLookupAfterAwait || []).length > 0;
  const writes = allWrites(candidate);
  const moduleWrites = writes.some(write => write.scopeDepth === 1);
  const wrapper = candidate.source?.ownerWrapperPresent === true;
  const global = isGlobalCallback(candidate);
  const durable = durableCue(candidate);
  let priority = 0;
  if(durable) priority += 100;
  if(activeAfterAwait) priority += 80;
  if(awaitCount) priority += 40;
  if(global) priority += 30;
  if(moduleWrites) priority += 15;
  if(!candidate.source?.ownerCheckPresent && !wrapper) priority += 10;

  const fastTrace = !durable && !awaitCount && !global && wrapper;
  return {
    priority,
    durable,
    activeAfterAwait,
    awaits: awaitCount,
    global,
    moduleWrites,
    ownerWrapper: wrapper,
    ownerCheck: candidate.source?.ownerCheckPresent === true,
    fastTrace
  };
}

function routeKey(candidate){
  const writes = allWrites(candidate)
    .map(write => [write.name || '', write.kind || '', write.scopeDepth ?? '', (write.via || []).join('>')].join(':'))
    .sort();
  const sinks = (candidate.source?.externalSinks || [])
    .map(sink => sink.name || '')
    .sort();
  return JSON.stringify({
    file: candidate.source?.file || '',
    registeredBy: candidate.source?.registeredBy || '',
    writes,
    sinks
  });
}

function buildReviewQueue(ledger){
  const candidates = (ledger?.candidates || [])
    .filter(candidate => candidate.review?.status === 'pending source trace')
    .map(candidate => ({ ...candidate, queueSignals: reviewSignals(candidate), routeKey: routeKey(candidate) }));
  const routesByKey = new Map();
  for(const candidate of candidates){
    const members = routesByKey.get(candidate.routeKey) || [];
    members.push(candidate);
    routesByKey.set(candidate.routeKey, members);
  }
  const routes = [...routesByKey.values()].map(members => ({
    id: `route-${crypto.createHash('sha1').update(members[0].routeKey).digest('hex').slice(0, 10)}`,
    members,
    priority: Math.max(...members.map(candidate => candidate.queueSignals.priority)),
    fastTrace: members.every(candidate => candidate.queueSignals.fastTrace)
  }));
  const byPriority = (a, b) => b.priority - a.priority
    || b.members.length - a.members.length
    || a.members[0].id.localeCompare(b.members[0].id);
  const fastTraceRoutes = routes.filter(route => route.fastTrace)
    .sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));
  const riskRoutes = routes.slice().sort(byPriority);
  const riskCandidates = candidates.slice().sort((a, b) =>
    b.queueSignals.priority - a.queueSignals.priority
    || a.id.localeCompare(b.id)
  );
  return { candidates, routes, fastTraceRoutes, riskRoutes, riskCandidates };
}

function formatRoute(route){
  const first = route.members[0];
  return `${route.id}\t${route.members.length}\t${route.priority}\t${first.source?.file || ''}\t${first.source?.registeredBy || '(not captured)'}\t${route.members.map(item => item.id).join(', ')}`;
}

function main(){
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const queue = buildReviewQueue(ledger);
  const pending = queue.candidates;
  const asyncCount = pending.filter(candidate => candidate.queueSignals.awaits > 0).length;
  const globalCount = pending.filter(candidate => candidate.queueSignals.global).length;
  const durableCount = pending.filter(candidate => candidate.queueSignals.durable).length;
  const wrapperCount = pending.filter(candidate => candidate.queueSignals.ownerWrapper).length;
  const fastRows = pending.filter(candidate => candidate.queueSignals.fastTrace).length;
  const all = process.argv.includes('--all');
  const limitArgument = process.argv.find(argument => argument.startsWith('--limit='));
  const limit = all ? Infinity : Math.max(1, Number(limitArgument?.slice(8)) || 15);

  process.stdout.write([
    `Pending candidates: ${pending.length} across ${new Set(pending.map(candidate => candidate.source?.file)).size} files.`,
    `Review routes: ${queue.routes.length}; repeated routes: ${queue.routes.filter(route => route.members.length > 1).length}; rows in repeated routes: ${queue.routes.filter(route => route.members.length > 1).reduce((sum, route) => sum + route.members.length, 0)}.`,
    `Scanner cues: ${durableCount} detected durable sinks, ${asyncCount} callbacks with awaits, ${globalCount} document/global registrations, ${wrapperCount} recognized owner wrappers.`,
    `Fast-trace lane: ${fastRows} synchronous, non-durable rows through recognized owner wrappers in ${queue.fastTraceRoutes.length} routes. This is a review shortcut, not a safety verdict.`,
    'Route IDs only group matching source file, registration helper, and sink signature; they do not merge candidate dispositions.'
  ].join('\n') + '\n');

  process.stdout.write('\nFast-trace routes (largest first):\n');
  process.stdout.write('route\trows\tmax-risk\tfile\tregistration\tcandidates\n');
  queue.fastTraceRoutes.slice(0, limit).forEach(route => process.stdout.write(`${formatRoute(route)}\n`));

  process.stdout.write('\nHighest-priority candidates (each row remains independent):\n');
  process.stdout.write('priority\tfile:line\tcallback\tregistration\tawaits\towner-cue\n');
  queue.riskCandidates.slice(0, limit).forEach(candidate => {
    const ownerCue = candidate.queueSignals.ownerCheck
      ? 'guard'
      : (candidate.queueSignals.ownerWrapper ? 'wrapper' : 'none');
    process.stdout.write(`${candidate.queueSignals.priority}\t${candidate.source.file}:${candidate.source.line}\t${candidate.source.callback}\t${candidate.source.registeredBy || '(not captured)'}\t${candidate.queueSignals.awaits}\t${ownerCue}\n`);
  });

  if(all){
    process.stdout.write('\nAll review routes, ordered by risk and shared trace yield:\n');
    process.stdout.write('route\trows\tmax-risk\tfile\tregistration\tcandidates\n');
    queue.riskRoutes.forEach(route => process.stdout.write(`${formatRoute(route)}\n`));
  }
}

if(require.main === module){
  main();
}

module.exports = { buildReviewQueue, reviewSignals, routeKey };
