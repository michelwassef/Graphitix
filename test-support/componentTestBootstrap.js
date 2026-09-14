'use strict';

const path = require('path');
const {
  readProductionScriptManifest,
  validateProductionScriptManifest
} = require('./productionBootstrap.js');

const ROOT_DIR = path.resolve(__dirname, '..');

function resolveSourcePath(rootDir, source){
  return path.join(rootDir, ...String(source).split('/'));
}

function readSharedProductionSources(rootDir = ROOT_DIR){
  const manifest = readProductionScriptManifest(rootDir);
  const failures = validateProductionScriptManifest(manifest, rootDir);
  if(failures.length){
    throw new Error(`Invalid production bootstrap manifest:\n${failures.join('\n')}`);
  }
  return manifest
    .filter(entry => entry.local && (entry.source === 'js/vendor.js' || entry.source.startsWith('js/shared/')))
    .map(entry => entry.source);
}

function loadSharedProductionModules(options = {}){
  const rootDir = path.resolve(options.rootDir || ROOT_DIR);
  const sources = readSharedProductionSources(rootDir);
  const loadedSources = [];
  sources.forEach(source => {
    require(resolveSourcePath(rootDir, source));
    loadedSources.push(source);
  });
  return Object.freeze(loadedSources);
}

function loadComponentTestBootstrap(componentType, options = {}){
  const type = String(componentType || '').trim().toLowerCase();
  if(!type || !/^[a-z][a-z0-9-]*$/.test(type)){
    throw new Error(`Invalid component test bootstrap type: ${String(componentType)}`);
  }
  const rootDir = path.resolve(options.rootDir || ROOT_DIR);
  const loadedSources = loadSharedProductionModules({ rootDir });
  const componentSource = `js/components/${type}.js`;
  require(resolveSourcePath(rootDir, componentSource));
  return Object.freeze({
    componentType: type,
    sharedSources: loadedSources,
    componentSource
  });
}

module.exports = {
  loadSharedProductionModules,
  loadComponentTestBootstrap,
  readSharedProductionSources
};
