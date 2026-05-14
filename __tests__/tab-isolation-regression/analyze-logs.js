'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PATTERNS = [
  { key: 'pageError', severity: 'fail', regex: /\[pageerror\]|Unhandled|uncaught|TypeError|ReferenceError|SyntaxError/i },
  { key: 'previewCleared', severity: 'fail', regex: /preview cleared/i },
  { key: 'previewCaptureFailed', severity: 'warn', regex: /preview capture failed/i },
  { key: 'previewOutsideRoot', severity: 'warn', regex: /preview .*outside (?:target )?tab root|preview live svg ignored outside tab root/i },
  { key: 'duplicateLikePreviewCapture', severity: 'warn', regex: /preview capture success/i },
  { key: 'drift', severity: 'fail', regex: /DRIFT on skipped path|payload drift detected \(clean tab projected a different signature\)/i },
  { key: 'cacheValidationFailed', severity: 'fail', regex: /render cache .*validation failed|workspace render cache basic validation failed/i },
  { key: 'cacheUnavailable', severity: 'warn', regex: /workspace same-component render cache unavailable/i },
  { key: 'cacheRestored', severity: 'info', regex: /workspace render cache restored|same-component render cache restore allowed|generic render cache validation accepted/i },
  { key: 'archiveCacheConsumed', severity: 'info', regex: /archive render cache consumed|archive render cache cleared/i },
  { key: 'layoutApplySkipped', severity: 'fail', regex: /componentLayout\.applyStateFor skipped|workspace layout applied .*applied:\s*false/i },
  { key: 'exactLayoutCaptureFailed', severity: 'fail', regex: /captureExactTabLayoutClone skipped|exact tab layout capture failed/i },
  { key: 'agGridRowHeightZero', severity: 'fail', regex: /getRowHeight.*cannot be zero/i },
  { key: 'graphEmptyReuseBlocked', severity: 'warn', regex: /workspace reuse blocked because mounted graph is empty/i },
  { key: 'longClickHandler', severity: 'info', regex: /\[Violation\].*click.*took|Forced reflow while executing JavaScript/i }
];

function parseArgs(argv) {
  const out = { initialLogPath: '', saveLogPath: '', coldLogPath: '', reopenedLogPath: '', quiet: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--initial') out.initialLogPath = next();
    else if (arg === '--save') out.saveLogPath = next();
    else if (arg === '--cold') out.coldLogPath = next();
    else if (arg === '--reopened') out.reopenedLogPath = next();
    else if (arg === '--quiet') out.quiet = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}
function readMaybe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}
function extractPreviewCaptures(text) {
  const rows = [];
  const regex = /preview capture success \{[^\n]*tabId:\s*'([^']+)'[^\n]*type:\s*'([^']+)'[^\n]*length:\s*(\d+)/g;
  let m;
  while ((m = regex.exec(text))) {
    rows.push({ tabId: m[1], type: m[2], length: Number(m[3]) });
  }
  const suspicious = [];
  const byTypeLength = new Map();
  rows.forEach(row => {
    const key = `${row.type}:${row.length}`;
    if (!byTypeLength.has(key)) byTypeLength.set(key, []);
    byTypeLength.get(key).push(row.tabId);
  });
  for (const [key, ids] of byTypeLength.entries()) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length > 1) {
      const [type, length] = key.split(':');
      suspicious.push({ type, length: Number(length), tabIds: uniqueIds });
    }
  }
  return { rows, suspicious };
}
function countPattern(text, regex) {
  const m = text.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'));
  return m ? m.length : 0;
}
function analyzeOneLog(label, filePath, text) {
  const patternCounts = {};
  const failures = [];
  const warnings = [];
  for (const p of DEFAULT_PATTERNS) {
    const count = countPattern(text, p.regex);
    patternCounts[p.key] = count;
    if (count > 0 && p.severity === 'fail') failures.push(`${label}: ${p.key} matched ${count} time(s)`);
    if (count > 0 && p.severity === 'warn') warnings.push(`${label}: ${p.key} matched ${count} time(s)`);
  }
  const previewCaptures = extractPreviewCaptures(text);
  previewCaptures.suspicious.forEach(group => {
    warnings.push(`${label}: same component preview captures have identical serialized length for ${group.type}/${group.length}: ${group.tabIds.join(', ')}`);
  });
  return { label, filePath, bytes: Buffer.byteLength(text, 'utf8'), patternCounts, previewCaptures, failures, warnings };
}
function analyzeLogs(options = {}) {
  const logs = [
    { label: 'initial', filePath: options.initialLogPath || '' },
    { label: 'save', filePath: options.saveLogPath || '' },
    { label: 'cold', filePath: options.coldLogPath || '' },
    { label: 'reopened', filePath: options.reopenedLogPath || '' }
  ].filter(item => item.filePath);
  const analyses = logs.map(item => analyzeOneLog(item.label, item.filePath, readMaybe(item.filePath)));
  const failures = analyses.flatMap(a => a.failures);
  const warnings = analyses.flatMap(a => a.warnings);
  const summaryCounts = {};
  analyses.forEach(a => {
    for (const [key, value] of Object.entries(a.patternCounts)) {
      summaryCounts[key] = (summaryCounts[key] || 0) + value;
    }
  });
  const result = { analyses, summaryCounts, failures, warnings };
  if (!options.quiet) console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const result = analyzeLogs(args);
  if (args.quiet) {
    console.log('Log analysis');
    console.log(JSON.stringify(result.summaryCounts, null, 2));
    if (result.failures.length) {
      console.log('FAILURES:');
      result.failures.forEach(f => console.log(`- ${f}`));
      process.exitCode = 1;
    } else {
      console.log('PASS');
    }
    if (result.warnings.length) {
      console.log('WARNINGS:');
      result.warnings.forEach(w => console.log(`- ${w}`));
    }
  }
}

module.exports = { analyzeLogs };
