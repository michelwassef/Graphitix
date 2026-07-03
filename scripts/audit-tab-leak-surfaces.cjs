#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const componentsDir = path.join(root, 'js', 'components');
const reportPath = path.join(root, 'refactor-tab-leak-expanded-audit-current.txt');

const files = fs.readdirSync(componentsDir)
  .filter(name => name.endsWith('.js'))
  .sort()
  .map(name => path.join(componentsDir, name));

const classes = [
  {
    key: 'event-control-callbacks',
    label: 'Ownerless event/control callback candidates',
    risk: 'HIGH',
    test: line => /\.addEventListener\s*\(/.test(line) || /\bon(?:click|change|input|toggle|mousedown|mouseup|mousemove)\s*=/.test(line)
  },
  {
    key: 'async-timer-callbacks',
    label: 'Async/timer/worker stale-owner candidates',
    risk: 'HIGH',
    test: line => /\b(setTimeout|setInterval|requestAnimationFrame|Promise\.|new\s+Worker|\.postMessage\s*\(|\.then\s*\()/.test(line)
  },
  {
    key: 'keyless-pending-cache',
    label: 'Keyless pending/cache/result mirror candidates',
    risk: 'MEDIUM',
    test: line => /\b(pending|deferred|cache|result|timer|handle)\w*\s*=/.test(line) && !/session\.|\.timers\.|\.cache\.|\.results\.|const\s+\{/.test(line)
  },
  {
    key: 'active-refs-mirrors',
    label: 'Active refs/managers/HOT/root mirror candidates',
    risk: 'MEDIUM',
    test: line => /\b(let|var)\s+\w*(Hot|Manager|Root|Refs?|State|Layout|Overlay)\w*\s*=/.test(line)
  },
  {
    key: 'global-listener-bound-flags',
    label: 'Global listener / one-time bound-flag candidates',
    risk: 'MEDIUM',
    test: line => /\b(document|window|global\.document|global\.window)\.addEventListener\s*\(/.test(line) || /\b(let|var)\s+\w*Bound\w*\s*=/.test(line)
  },
  {
    key: 'active-draw-schedulers',
    label: 'Active-singleton draw scheduler calls',
    risk: 'HIGH',
    test: line => /scheduleActive[A-Z]\w*Draw\s*\(/.test(line)
  }
];

const findings = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;
    for (const cls of classes) {
      if (cls.test(trimmed)) {
        findings.push({ file: rel, line: index + 1, classKey: cls.key, label: cls.label, risk: cls.risk, text: trimmed.slice(0, 220) });
      }
    }
  });
}

const byClass = new Map();
const byFile = new Map();
for (const item of findings) {
  byClass.set(item.classKey, (byClass.get(item.classKey) || 0) + 1);
  byFile.set(item.file, (byFile.get(item.file) || 0) + 1);
}

const now = new Date().toISOString();
const out = [];
out.push('GRAPHITIX EXPANDED TAB-LEAK SURFACE AUDIT');
out.push(`Generated: ${now}`);
out.push('Scope: js/components/*.js');
out.push('');
out.push('This is a conservative static audit. Findings are candidates for triage, not automatic proof of a bug.');
out.push('Prioritize ownerless callbacks that mutate module state or call active-singleton draw schedulers.');
out.push('');
out.push('Summary by class:');
for (const cls of classes) {
  out.push(`- ${cls.label}: ${byClass.get(cls.key) || 0}`);
}
out.push('');
out.push('Summary by component:');
for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  out.push(`- ${file}: ${count}`);
}
out.push('');
for (const cls of classes) {
  const classFindings = findings.filter(item => item.classKey === cls.key);
  out.push('----------------------------------------------------------------------');
  out.push(`${cls.label} (${cls.risk}) — ${classFindings.length}`);
  out.push('----------------------------------------------------------------------');
  for (const item of classFindings) {
    out.push(`${item.file}:${item.line}: ${item.text}`);
  }
  out.push('');
}

fs.writeFileSync(reportPath, out.join('\n') + '\n');
console.log(`Wrote ${path.relative(root, reportPath)} with ${findings.length} findings.`);
