(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const schema = Shared.graphArchiveSchema = Shared.graphArchiveSchema || {};

  const TAB_FILE_NAMES = Object.freeze({
    tab: 'tab.json',
    payload: 'payload.json',
    rawCsv: 'raw/data.csv',
    config: 'graph-config.json',
    layout: 'layout.json',
    exclusions: 'raw/exclusions.json',
    preview: 'preview.json',
    renderCache: 'render-cache.json',
    uiState: 'ui-state.json'
  });

  const README_CONTENT_LINES = Object.freeze([
    '- manifest.json: archive index (version, tabs, active tab).',
    '- tabs/<Tab Name>/raw/data.csv: raw tabular input.',
    '- tabs/<Tab Name>/graph-config.json: graph/stat settings.',
    '- tabs/<Tab Name>/payload.json: payload snapshot (may omit raw data in lite mode).',
    '- tabs/<Tab Name>/layout.json: panel/layout state.',
    '- tabs/<Tab Name>/preview.json: cached tab preview markup (when available).',
    '- tabs/<Tab Name>/render-cache.json: serialized one-shot render snapshot for redraw-free restore (when available).',
    '- tabs/<Tab Name>/ui-state.json: toolbar, table viewport, and component UI state (when available).'
  ]);

  function joinArchivePath(folderPath, fileName) {
    return `${folderPath}/${fileName}`;
  }

  schema.buildTabFileMap = function buildTabFileMap(folderPath, flags = {}) {
    return {
      tab: joinArchivePath(folderPath, TAB_FILE_NAMES.tab),
      payload: joinArchivePath(folderPath, TAB_FILE_NAMES.payload),
      rawCsv: joinArchivePath(folderPath, TAB_FILE_NAMES.rawCsv),
      config: joinArchivePath(folderPath, TAB_FILE_NAMES.config),
      layout: joinArchivePath(folderPath, TAB_FILE_NAMES.layout),
      exclusions: joinArchivePath(folderPath, TAB_FILE_NAMES.exclusions),
      preview: flags.preview ? joinArchivePath(folderPath, TAB_FILE_NAMES.preview) : null,
      renderCache: flags.renderCache ? joinArchivePath(folderPath, TAB_FILE_NAMES.renderCache) : null,
      uiState: flags.uiState ? joinArchivePath(folderPath, TAB_FILE_NAMES.uiState) : null
    };
  };

  schema.buildArchiveReadme = function buildArchiveReadme(manifest) {
    const lines = [
      'Graph Archive (.graph)',
      '======================',
      '',
      'This .graph file is a ZIP archive designed for transparent scientific workflows.',
      '',
      'Contents:',
      ...README_CONTENT_LINES,
      '',
      `Archive format: ${manifest.format}`,
      `Archive version: ${manifest.version}`,
      `Scope: ${manifest.scope || 'unknown'}`,
      `Saved at: ${manifest.createdAt}`,
      `Tab count: ${manifest.tabCount}`
    ];
    return lines.join('\r\n');
  };

  schema.TAB_FILE_NAMES = TAB_FILE_NAMES;
  schema.README_CONTENT_LINES = README_CONTENT_LINES;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = schema;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
