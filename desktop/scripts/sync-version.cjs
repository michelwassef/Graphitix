const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const rootPackagePath = path.join(repoRoot, 'package.json');
const desktopPackagePath = path.join(desktopRoot, 'package.json');
const desktopLockPath = path.join(desktopRoot, 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function syncPackageVersion(rootVersion) {
  const desktopPkg = readJson(desktopPackagePath);
  if (desktopPkg.version === rootVersion) {
    return false;
  }
  desktopPkg.version = rootVersion;
  writeJson(desktopPackagePath, desktopPkg);
  return true;
}

function syncLockVersion(rootVersion) {
  if (!fs.existsSync(desktopLockPath)) {
    return false;
  }
  const lock = readJson(desktopLockPath);
  let changed = false;
  if (lock.version !== rootVersion) {
    lock.version = rootVersion;
    changed = true;
  }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== rootVersion) {
    lock.packages[''].version = rootVersion;
    changed = true;
  }
  if (changed) {
    writeJson(desktopLockPath, lock);
  }
  return changed;
}

function main() {
  if (!fs.existsSync(rootPackagePath)) {
    throw new Error(`Missing root package.json at ${rootPackagePath}`);
  }
  if (!fs.existsSync(desktopPackagePath)) {
    throw new Error(`Missing desktop package.json at ${desktopPackagePath}`);
  }
  const rootPkg = readJson(rootPackagePath);
  const rootVersion = String(rootPkg.version || '').trim();
  if (!rootVersion) {
    throw new Error('Root package.json is missing a valid version field');
  }

  const packageChanged = syncPackageVersion(rootVersion);
  const lockChanged = syncLockVersion(rootVersion);

  if (packageChanged || lockChanged) {
    console.log(`[desktop:sync:version] synced desktop version to ${rootVersion}`);
    return;
  }
  console.log(`[desktop:sync:version] already in sync (${rootVersion})`);
}

main();
