#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const componentsDir = path.join(root, 'js', 'components');
const reportPath = path.join(root, 'refactor-tab-leak-audit-current.txt');

const files = fs.readdirSync(componentsDir)
  .filter(name => name.endsWith('.js'))
  .sort()
  .map(name => path.join(componentsDir, name));

const interesting = /\b(title|legend|label|annotation|position|drag|move|xLabel|yLabel|labelPositions|legendPosition|titlePosition)\b/i;
const mutation = /(addEventListener\s*\(|enableLabelDrag|onDrag|dragHandler|\.style\.(left|top|transform)\s*=|labelPositions\s*=|legendPosition\s*=|titlePosition\s*=|patch\w*(Label|Visual|Position)|scheduleActive[A-Z]\w*Draw\s*\()/;

const findings = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;
    if (interesting.test(trimmed) && mutation.test(trimmed)) {
      findings.push({ file: rel, line: index + 1, text: trimmed.slice(0, 240) });
    }
  });
}

const byFile = new Map();
for (const item of findings) byFile.set(item.file, (byFile.get(item.file) || 0) + 1);
const out = [];
out.push('GRAPHITIX LABEL / ANNOTATION POSITION TAB-LEAK AUDIT');
out.push(`Generated: ${new Date().toISOString()}`);
out.push('Scope: js/components/*.js');
out.push('');
out.push('This report flags drag/edit/position code that should be owner-session-first before compatibility mirrors are deleted.');
out.push('');
out.push('Summary by component:');
for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  out.push(`- ${file}: ${count}`);
}
out.push('');
out.push('Findings:');
for (const item of findings) out.push(`${item.file}:${item.line}: ${item.text}`);
fs.writeFileSync(reportPath, out.join('\n') + '\n');
console.log(`Wrote ${path.relative(root, reportPath)} with ${findings.length} findings.`);
