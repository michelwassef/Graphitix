'use strict';

const fs = require('fs');
const path = require('path');

function writeBase64File(base64, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

async function buildWorkspaceArchive(page, options = {}) {
  return page.evaluate(async archiveOptions => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const actions = window.Main?.sessionActions;
    if (!context || typeof actions?.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Workspace archive builder is unavailable.');
    }
    const blob = await actions.buildWorkspaceArchiveBlob(context, archiveOptions);
    if (!blob) {
      throw new Error('Workspace archive was not created.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return { base64: btoa(binary), size: blob.size };
  }, options);
}

async function parseWorkspaceArchive(page, base64, fileName = 'workspace.graph') {
  return page.evaluate(async ({ encoded, name }) => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const archive = window.Shared?.graphArchive;
    if (typeof archive?.parseFile !== 'function') {
      throw new Error('Workspace archive parser is unavailable.');
    }
    return archive.parseFile(new Blob([bytes], { type: 'application/zip' }), { fileName: name });
  }, { encoded: base64, name: fileName });
}

function summarizeArchiveMetadata(parsed) {
  const manifest = parsed?.manifest || null;
  const session = parsed?.session || null;
  const manifestTabs = Array.isArray(manifest?.tabs) ? manifest.tabs : [];
  const sessionTabs = Array.isArray(session?.tabs) ? session.tabs : [];
  const tabs = sessionTabs.map((tab, index) => {
    const entry = manifestTabs[index] || {};
    return {
      index,
      title: tab?.title || entry.title || null,
      type: tab?.type || entry.type || null,
      payloadMode: entry.payloadMode || null,
      runtimeTabIdPresent: Boolean(tab?.archiveRuntimeTabId || entry.runtimeTabId),
      hasLayout: !!tab?.layout,
      hasPreview: !!tab?.previewMarkup,
      hasRenderCache: !!tab?.archiveRenderCache,
      hasUiState: !!tab?.uiState
    };
  });
  return {
    schemaVersion: 1,
    source: parsed?.source || null,
    format: manifest?.format || null,
    archiveVersion: manifest?.version || null,
    scope: manifest?.scope || session?.scope || null,
    createdAt: manifest?.createdAt || session?.savedAt || null,
    activeIndex: Number.isInteger(session?.activeIndex) ? session.activeIndex : null,
    tabCount: tabs.length,
    tabs
  };
}

async function saveWorkspaceArchive(page, filePath, options = {}) {
  const archive = await buildWorkspaceArchive(page, options);
  writeBase64File(archive.base64, filePath);
  return { ...archive, filePath };
}

async function openWorkspaceArchive(page, archive, options = {}) {
  if (typeof archive !== 'string' && !options.filePath) {
    throw new Error('openWorkspaceArchive requires options.filePath for an encoded archive.');
  }
  const filePath = typeof archive === 'string'
    ? archive
    : writeBase64File(archive.base64, options.filePath);
  if (options.reload !== false) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  const inputSelector = options.inputSelector || '#workspaceSessionInput';
  await page.locator(inputSelector).setInputFiles(filePath);
  if (options.componentType) {
    await waitForWorkspaceTab(page, options.componentType, options.timeout);
  }
  return filePath;
}

async function waitForWorkspaceTab(page, componentType, timeout = 60_000) {
  await page.waitForFunction(type => {
    const tabs = window.Main?.session?.workspaceState?.tabs;
    return Array.isArray(tabs) && tabs.some(tab => tab?.type === type && !tab?.isWelcome);
  }, componentType, { timeout });
}

module.exports = {
  buildWorkspaceArchive,
  openWorkspaceArchive,
  parseWorkspaceArchive,
  summarizeArchiveMetadata,
  saveWorkspaceArchive,
  waitForWorkspaceTab,
  writeBase64File
};
