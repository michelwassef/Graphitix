const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// SHA-256 of normalized inner SVG markup from the GitHub-visible welcome cards.
const GITHUB_VISIBLE_ICON_HASHES = Object.freeze({
  box: '48a4f49ade7da9c15d24779661a2f1082ed03fde7afba06738be10722b743974',
  scatter: 'c8d73109ff86ce83386a1e0533f25c6bfd25fadf5688f57a544972b11e9cb1be',
  line: '51ac4afe1b7f54c71f4762cec666068490f09d5cbf4a099c32ce9853e78c6f82',
  hist: '0de55f5c1af94fa0ef4aee21e4a3e998b2b0af85dad624faa9ffd2d655d6cfe8',
  heatmap: '728b0363e81f98090e9d2ae75c3131d934edf63fbd72c52424179cfab561f5f3',
  pca: '085349aa5eaa67df03d91f2546f2006935bc9154f4e29e563b39f806c437c3b6',
  pie: '2cfe39b310169dcf8f11ff6462ec90bdb9cf9ef4dd44013a2a7c2227ba278461',
  roc: '3bfa4998b975b5a56266a3ec04b069c9967c35becce27c38dd7f5fa8a2583667',
  survival: '05e58cbb81da7e5da3d1be4d9b9ad414b52d8d06caeec6f8b329fd5089e963a1',
  venn: 'f3cb4982e5f1e32a92940d6ea54e269b1c1931045fadc3c432a809d5a89dc530',
  surface: 'f618024b5fc98224602e2b0c548665da1a4689ecb7f20c097af96bc33cf5378f'
});

function readWelcomeCssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) {
    throw new Error(`Missing welcome CSS rule: ${selector}`);
  }
  return match[1];
}

function normalizeIconMarkup(markup) {
  return String(markup || '').trim().replace(/>\s+</g, '><');
}

function hashIconMarkup(markup) {
  return crypto.createHash('sha256').update(normalizeIconMarkup(markup), 'utf8').digest('hex');
}

function extractCanonicalIconMarkup(source, type) {
  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = '^[\\t ]*' + escapedType + ':\\s*welcomeGraphIcon\\(`\\r?\\n([\\s\\S]*?)\\r?\\n[\\t ]*`\\s*(?:,\\s*\\{[^}]*\\})?\\),?';
  const match = source.match(new RegExp(pattern, 'm'));
  if (!match) {
    throw new Error(`Missing canonical welcome icon: ${type}`);
  }
  return match[1];
}

function listSourceFiles(rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '_site') continue;
    const target = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(target));
    } else if (/\.(?:html|js)$/.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

describe('welcome graph icon presentation', () => {
  test('keeps graph-card icon artwork at the deployed reference metrics', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    const tileRule = readWelcomeCssRule(css, '.graph-card__icon');
    const artworkRule = readWelcomeCssRule(css, '.graph-card__icon .welcome-graph-icon');

    expect(tileRule).toMatch(/width:\s*44px\s*;/);
    expect(tileRule).toMatch(/height:\s*44px\s*;/);
    expect(tileRule).toMatch(/flex:\s*0\s+0\s+44px\s*;/);
    expect(artworkRule).toMatch(/width:\s*39px\s*;/);
    expect(artworkRule).toMatch(/height:\s*39px\s*;/);
    expect(artworkRule).toMatch(/transform:\s*scale\(1\.12\)\s*;/);
    expect(artworkRule).not.toMatch(/translate/);
  });

  test('keeps one canonical SVG source for welcome graph icons', () => {
    const sourceFiles = [path.join(ROOT, 'index.html'), ...listSourceFiles(path.join(ROOT, 'js'))];
    const svgLiteralOwners = sourceFiles
      .map(file => ({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        count: (fs.readFileSync(file, 'utf8').match(/<svg class="welcome-graph-icon"/g) || []).length
      }))
      .filter(record => record.count > 0);

    expect(svgLiteralOwners).toEqual([
      { file: 'js/main/bootstrap.js', count: 1 }
    ]);

    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(indexHtml).not.toMatch(/<article[^>]+data-graph-type=/);
    expect(indexHtml).not.toMatch(/<svg[^>]+welcome-graph-icon/);
  });

  test('extracts canonical icon markup across LF and CRLF checkouts', () => {
    const bootstrapSource = fs.readFileSync(path.join(ROOT, 'js', 'main', 'bootstrap.js'), 'utf8');
    const lfSource = bootstrapSource.replace(/\r\n/g, '\n');
    const crlfSource = lfSource.replace(/\n/g, '\r\n');

    for (const type of Object.keys(GITHUB_VISIBLE_ICON_HASHES)) {
      expect(hashIconMarkup(extractCanonicalIconMarkup(crlfSource, type))).toBe(
        hashIconMarkup(extractCanonicalIconMarkup(lfSource, type))
      );
    }
  });

  test('matches every welcome icon to the GitHub-visible reference geometry', () => {
    const bootstrapSource = fs.readFileSync(path.join(ROOT, 'js', 'main', 'bootstrap.js'), 'utf8');
    const actualHashes = Object.fromEntries(
      Object.keys(GITHUB_VISIBLE_ICON_HASHES).map(type => [
        type,
        hashIconMarkup(extractCanonicalIconMarkup(bootstrapSource, type))
      ])
    );

    expect(actualHashes).toEqual(GITHUB_VISIBLE_ICON_HASHES);
  });
});
