'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_ORDER = Object.freeze([
  'js/main/session.js',
  'js/main/domControls.js',
  'js/main/sessionActions.js',
  'js/main/tabDrag.js',
  'js/main/previews.js',
  'js/main.js'
]);

function normalizeSource(source) {
  return String(source || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .split(/[?#]/, 1)[0];
}

function parseScriptSources(html) {
  const sources = [];
  const scriptPattern = /<script\b([^>]*)>/gi;
  let match;
  while ((match = scriptPattern.exec(String(html || '')))) {
    const attributes = match[1] || '';
    const srcMatch = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch) continue;
    const source = normalizeSource(srcMatch[2]);
    sources.push({
      index: sources.length,
      source,
      local: !/^https?:\/\//i.test(source),
      defer: /\bdefer(?:\s|=|$)/i.test(attributes),
      type: (attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2] || 'text/javascript').toLowerCase()
    });
  }
  return Object.freeze(sources.map(entry => Object.freeze(entry)));
}

function readProductionScriptManifest(rootDir) {
  const resolvedRoot = path.resolve(rootDir || path.resolve(__dirname, '..'));
  const htmlPath = path.join(resolvedRoot, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Production entry point not found: ${htmlPath}`);
  }
  return parseScriptSources(fs.readFileSync(htmlPath, 'utf8'));
}

function validateProductionScriptManifest(manifest, rootDir) {
  const failures = [];
  const entries = Array.isArray(manifest) ? manifest : [];
  const seen = new Set();
  const resolvedRoot = path.resolve(rootDir || path.resolve(__dirname, '..'));
  for (const entry of entries) {
    if (!entry.source || seen.has(entry.source)) {
      failures.push(`duplicate or missing production script source: ${entry.source || '(missing)'}`);
    }
    seen.add(entry.source);
    if (entry.local && !fs.existsSync(path.join(resolvedRoot, entry.source))) {
      failures.push(`production script source does not exist: ${entry.source}`);
    }
  }
  const localSources = entries.filter(entry => entry.local).map(entry => entry.source);
  for (let index = 1; index < REQUIRED_ORDER.length; index += 1) {
    const prior = localSources.indexOf(REQUIRED_ORDER[index - 1]);
    const current = localSources.indexOf(REQUIRED_ORDER[index]);
    if (prior < 0 || current < 0 || prior >= current) {
      failures.push(`production bootstrap order violation: ${REQUIRED_ORDER[index - 1]} before ${REQUIRED_ORDER[index]}`);
    }
  }
  if (entries.length === 0 || !localSources.includes('js/main.js')) {
    failures.push('production bootstrap does not load js/main.js');
  } else if (localSources.at(-1) !== 'js/main.js') {
    failures.push('production bootstrap must load js/main.js last');
  }
  return failures;
}

module.exports = {
  REQUIRED_ORDER,
  normalizeSource,
  parseScriptSources,
  readProductionScriptManifest,
  validateProductionScriptManifest
};
