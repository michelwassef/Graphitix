const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const serverScript = path.join(repoRoot, 'scripts', 'e2e-server.cjs');
const devPort = Number(process.env.VENN_DEV_PORT || '4173');
const devUrl = process.env.VENN_DEV_URL || `http://127.0.0.1:${devPort}/index.html`;

function waitForHttp(urlString, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(urlString, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${urlString}`));
        return;
      }
      setTimeout(attempt, 250);
    }

    attempt();
  });
}

function run() {
  const server = spawn(process.execPath, [serverScript, '--port', String(devPort)], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  let electron = null;
  let stopping = false;

  const stopAll = (code = 0) => {
    if (stopping) return;
    stopping = true;
    if (electron && !electron.killed) {
      electron.kill();
    }
    if (server && !server.killed) {
      server.kill();
    }
    process.exit(code);
  };

  process.on('SIGINT', () => stopAll(130));
  process.on('SIGTERM', () => stopAll(143));

  server.on('exit', (code) => {
    if (stopping) return;
    if (code !== 0) {
      stopAll(code || 1);
    }
  });

  waitForHttp(devUrl, 20000)
    .then(() => {
      const electronBinary = require('electron');
      electron = spawn(electronBinary, ['.'], {
        cwd: desktopRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          VENN_ELECTRON_DEV: '1',
          VENN_DEV_URL: devUrl
        }
      });
      electron.on('exit', (code) => {
        stopAll(code || 0);
      });
    })
    .catch((err) => {
      console.error('[desktop:dev] failed to start:', err.message);
      stopAll(1);
    });
}

run();
