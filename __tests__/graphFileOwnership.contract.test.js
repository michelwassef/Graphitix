const fs = require('fs');
const path = require('path');

const components = [
  'box',
  'heatmap',
  'hist',
  'line',
  'pca',
  'pie',
  'roc',
  'scatter',
  'surface',
  'survival',
  'venn'
];

const readComponent = component => fs.readFileSync(
  path.join(__dirname, '..', 'js', 'components', `${component}.js`),
  'utf8'
).replace(/\r\n/g, '\n');

describe('graph-file owner isolation contract', () => {
  test.each(components)('%s captures an explicit owner before Shared.fileIO.openGraphFile', component => {
    const source = readComponent(component);
    expect(source).toContain(`owner: { component: '${component}', tabId:`);
  });

  test.each(components)('%s routes parsed graph payloads through the shared owner router', component => {
    const source = readComponent(component);
    expect(source).toContain('routeGraphOpenPayload');
    expect(source).toContain(`component: '${component}'`);
  });

  test.each(components)('%s passes an explicit owner to graph Save and Save As', component => {
    const source = readComponent(component);
    const ownerPattern = String.raw`owner:\s*\{\s*component:\s*['"]${component}['"],\s*tabId:`;
    expect(source).toMatch(new RegExp(String.raw`saveGraphFile\(\{[\s\S]{0,500}${ownerPattern}`));
    expect(source).toMatch(new RegExp(String.raw`saveGraphFileAs\(\{[\s\S]{0,500}${ownerPattern}`));
  });

  test.each(components)('%s does not rely on an ownerless graph-file completion callback', component => {
    const source = readComponent(component);
    expect(source).not.toMatch(new RegExp(String.raw`context:\s*['"]${component}['"][\s\S]{0,600}loadFromFile:\s*(?:file|blob)\s*=>`));
  });

  test('shared fileIO owns inactive routing, closed-owner rejection, type validation and stale-open suppression', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'fileIO.js'), 'utf8');
    for(const marker of [
      'createGraphOpenOperation',
      'latestGraphOpenOperationByOwner',
      'payload-type-mismatch',
      'stale-operation',
      'stale-owner',
      'commitTabPayload',
      'mergeInactiveGraphOpenLayout',
      'preferPayload: true',
      'applied-active-owner',
      'deferred-owner-payload',
      'createGraphSaveOperation',
      'resolveSavePayload',
      'inactiveOwnerCanonicalPayload',
      'resolveGraphOpenSvgBox'
    ]){
      expect(source).toContain(marker);
    }
  });

  test('shared graph-file ownership pins post-open sizing and save payload resolution to the initiating owner', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'fileIO.js'), 'utf8');
    expect(source).toContain("Shared.workspaceTabs?.getMountedRoot");
    expect(source).toContain("element: element || undefined");
    expect(source).toContain("inspection.tab.payload");
    expect(source).toContain("layoutState: inactiveLayout");
  });

});
