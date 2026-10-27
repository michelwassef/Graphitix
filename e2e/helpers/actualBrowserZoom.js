const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

/* global chrome */

async function launchChromiumAtBrowserZoom(options = {}) {
  const viewport = {
    width: Number(options.width) || 1280,
    height: Number(options.height) || 900
  };
  const extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-browser-zoom-'));
  fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Graphitix browser zoom test',
    version: '1.0.0',
    permissions: ['tabs'],
    host_permissions: ['http://127.0.0.1/*'],
    background: { service_worker: 'background.js' }
  }));
  fs.writeFileSync(path.join(extensionDir, 'background.js'), '');

  let context = null;
  try {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`
      ]
    });
    const page = context.pages()[0] || await context.newPage();
    const worker = context.serviceWorkers()[0]
      || await context.waitForEvent('serviceworker', { timeout: 10_000 });

    return {
      context,
      page,
      async setZoom(zoomFactor) {
        await worker.evaluate(async factor => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) throw new Error('No active browser tab is available for zoom');
          await chrome.tabs.setZoom(tab.id, factor);
          return chrome.tabs.getZoom(tab.id);
        }, zoomFactor);
        await page.waitForFunction(({ factor, width }) => (
          Math.abs(window.devicePixelRatio - factor) < 0.1
          && Math.abs(window.innerWidth - Math.floor(width / factor)) <= 2
        ), { factor: zoomFactor, width: viewport.width }, { timeout: 10_000 });
      },
      async close() {
        await context?.close();
        context = null;
        fs.rmSync(extensionDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await context?.close();
    fs.rmSync(extensionDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { launchChromiumAtBrowserZoom };
