'use strict';
// Test actual tableImport.openFile without Jest or a browser. This exercises
// archive selection, binary parsing, and association while bypassing the UI.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Blob}=require('node:buffer');
global.window=global;
global.JSZip=require('../libs/jszip.min.js');
global.pako=require('../libs/pako.min.js');
global.alert=()=>{};
global.FileReader=class FileReader{
  readAsArrayBuffer(file){file.arrayBuffer().then(buffer=>this.onload({target:{result:buffer}}),error=>this.onerror(error));}
};
require('../js/shared/prismBinary.js');
require('../js/shared/tableImport.js');

// Deterministic XML DOM fixture, generated from the separately validated
// synthetic PZFX XML by Python ElementTree. Not a replacement for browser DOM.
const fixtureXmlTree=JSON.parse(fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary','prism-legacy.xmltree.json'),'utf8'));
function mockElement(row){
  const children=row.children.map(mockElement);
  const node={nodeType:1,localName:row.name,nodeName:row.name,
    attributes:Object.entries(row.attributes).map(([name,value])=>({localName:name,value})),
    getAttribute(name){return row.attributes[name] ?? null},
    childNodes:children,
    getElementsByTagName(name){const out=[];for(const child of children){if(name==='*'||child.localName===name)out.push(child);out.push(...child.getElementsByTagName(name))}return out}
  };
  Object.defineProperty(node,'textContent',{get(){return row.text+children.map(c=>c.textContent).join('')}});
  return node;
}
global.DOMParser=class DOMParser{parseFromString(){return mockElement(fixtureXmlTree)}};

async function read(file, extraOptions = {}, bytes = null){
 const raw=bytes || fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary',file));
 const input={files:[Object.assign(new Blob([raw]),{name:file})],dataset:{}};
 const errors=[];
 const result=await global.Shared.tableImport.openFile(input,{
   suppressPrismLimitations:true,suppressPrismBatch:true,
   onRows:rows=>({rows:rows.length,cols:rows[0]?.length,importedRows:rows}),
   onError:(error,message)=>errors.push({error:error?.message,message}),
   renameTab:false,
   ...extraOptions
 });
 assert.deepEqual(errors,[],`Unexpected parse error in ${file}`);
 assert.ok(result,`Import result missing for ${file}`);
 return result;
}
(async()=>{
 const linked=await read('v10/prism-linked.prism');

 assert.deepEqual(linked.prismGraphBinary.axesStored.x,{min:1,max:3});
 assert.deepEqual(linked.prismGraphBinary.axesStored.primaryY,{min:0,max:10});
 assert.equal(linked.prismStyle.title,'Individual values');
 assert.equal(linked.prismStyle.xLabel,'my different experimental conditions');
 assert.equal(linked.prismStyle.yLabel,'signal intensity');
 assert.equal(linked.prismStyle.fontColor,'#000000');
 assert.equal(linked.prismMeta.component,'box');
 const unrelated=await read('v10/prism-unlinked.prism');

 assert.equal(unrelated.prismStyle,undefined);
 assert.equal(unrelated.prismGraphBinary,null);
 assert.equal(unrelated.prismMeta.component,'box');
 const zipped=await global.JSZip.loadAsync(fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary','v10','prism-linked.prism')));
 const corruptedGraph=Buffer.from(await zipped.file('graphs/G1/data.bin').async('uint8array'));
 corruptedGraph[corruptedGraph.length-1] ^= 0x10;
 zipped.file('graphs/G1/data.bin',corruptedGraph);
 const corrupt=await read('prism-corrupt.prism',{},await zipped.generateAsync({type:'nodebuffer'}));
 assert.equal(corrupt.prismGraphBinary,null);
 assert.equal(corrupt.prismStyle,undefined);
 assert.equal(corrupt.prismMeta.component,'box');
 assert.equal(linked.prismStyle.fontFamily,undefined,
   'Data-table font family must not be applied as a graph-wide font');
 assert.equal(linked.prismStyle.fontSize,undefined,
   'Data-table font size must not be applied as a graph-wide font');
 // Ambiguous graphs and mixed-table graphs have no safe association to the
 // selected data table. Each case must still import the data correctly.
 const makeArchive=async(graphs,tableYIds)=>{
   const archive=await global.JSZip.loadAsync(fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary','v10','prism-linked.prism')));
   const documentModel=JSON.parse(await archive.file('document.json').async('string'));
   const known=Buffer.from(await archive.file('graphs/G1/data.bin').async('uint8array'));
   documentModel.sheets.graphs=graphs.map(g=>g.id);
   archive.file('document.json',JSON.stringify(documentModel));
   for(const graph of graphs){
     archive.file(`graphs/${graph.id}/sheet.json`,JSON.stringify({title:graph.id,inputDataSets:graph.inputs}));
     archive.file(`graphs/${graph.id}/data.bin`,known);
   }
   if(tableYIds){
     const file='data/sheets/D1/sheet.json';
     const table=JSON.parse(await archive.file(file).async('string'));
     table.table.dataSets=tableYIds;
     archive.file(file,JSON.stringify(table));
   }
   return await archive.generateAsync({type:'nodebuffer'});
 };
 const candidates=[{id:'G1',inputs:['A1']},{id:'G2',inputs:['A1']}];
 const ambiguous=await read('ambiguous.prism',{},await makeArchive(candidates));
 assert.equal(ambiguous.prismStyle,undefined);
 assert.equal(ambiguous.prismGraphBinary,null);
 const chosen=await read('chosen.prism',{prismGraphId:'G2'},await makeArchive(candidates));
 assert.equal(chosen.prismStyle.title,'Individual values');
 const foreign=await read('foreign.prism',{},await makeArchive([{id:'G1',inputs:['A1','OTHER']} ]));
 assert.equal(foreign.prismStyle,undefined);
 assert.equal(foreign.prismGraphBinary,null);
 const foreignExplicit=await read('foreign-explicit.prism',{prismGraphId:'G1'},await makeArchive([{id:'G1',inputs:['A1','OTHER']} ]));
 assert.equal(foreignExplicit.prismStyle,undefined);
 const partial=await read('partial.prism',{},await makeArchive([{id:'G1',inputs:['A1']}],['A1','A2']));
 assert.equal(partial.prismStyle,undefined);
 assert.equal(partial.prismGraphBinary,null);
 // A reused input must not redirect an in-flight import to another tab's
 // graph choice or file. An asynchronous FileReader step makes this observable.
 const ownedZip=await global.JSZip.loadAsync(await makeArchive(candidates));
 const badFirst=Buffer.from(await ownedZip.file('graphs/G1/data.bin').async('uint8array'));
 badFirst[badFirst.length-1] ^= 0x10;
 ownedZip.file('graphs/G1/data.bin',badFirst);
 const ownedArchive=await ownedZip.generateAsync({type:'nodebuffer'});
 const firstFile=Object.assign(new Blob([ownedArchive]),{name:'owned.prism'});
 const changedFile=Object.assign(new Blob([fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary','v10','prism-unlinked.prism'))]),{name:'other.prism'});
 const reusedInput={files:[firstFile],dataset:{prismGraphId:'G2'}};
 const imported=global.Shared.tableImport.openFile(reusedInput,{
   suppressPrismLimitations:true,suppressPrismBatch:true,
   onRows:rows=>({rows:rows.length,cols:rows[0]?.length,importedRows:rows}),
   renameTab:false
 });
 reusedInput.files=[changedFile];
 reusedInput.dataset.prismGraphId='G1';
 reusedInput.dataset.prismTableId='UNRELATED';
 const importedResult=await imported;
 assert.equal(importedResult?.prismStyle?.title,'Individual values',
   'An inactive/sibling input projection must not replace the original graph selection');
 assert.equal(importedResult?.prismTableId,'D1');
 const dashArchive=await global.JSZip.loadAsync(fs.readFileSync(path.join(__dirname,'..','__tests__','fixtures','prism-binary','v10','prism-linked.prism')));
 const dashPath='data/sheets/D1/sheet.json';
 const dashSheet=JSON.parse(await dashArchive.file(dashPath).async('string'));
 dashSheet.title='TNF-';
 dashArchive.file(dashPath,JSON.stringify(dashSheet));
 const dash=await read('dash.prism',{},await dashArchive.generateAsync({type:'nodebuffer'}));
 assert.equal(dash.prismTableTitle,'TNF-',
   'Hyphens in legitimate Prism metadata must not be removed');
 const pzfx=await read('v6/prism-legacy.pzfx',{inspectPrismBinary:true});

 assert.equal(pzfx.prismStyle,undefined);
 assert.ok(!pzfx.prismMeta.graphType,
   'Legacy project-wide graph diagnostics must not guess a table subtype');
 assert.equal(pzfx.prismUnassociatedBinary.recordCount,375);
 assert.deepEqual(pzfx.prismUnassociatedBinary.axesStored.x,{min:1,max:2});
 const ordinaryPzfx=await read('v6/prism-legacy.pzfx');
 assert.equal(ordinaryPzfx.prismGraphBinary,null);
 assert.equal(ordinaryPzfx.prismUnassociatedBinary.recordCount,375,
   'A singleton table/template candidate is decoded for association, but mismatched series counts remain unassociated');
 const controlledDir='v10/controlled/';
 const baseline=await read(`${controlledDir}two-dataset-baseline.prism`);
 assert.equal(baseline.prismTableId,'C70F7189-AB63-4916-959C-34F980563E72',
   'The selected graph must choose its linked table when current data and graph sheets disagree');
 assert.equal(baseline.prismMeta.component,'scatter',
   'Unconnected XY data must be imported as Scatter regardless of replicate layout');
 assert.equal(baseline.prismMeta.graphType,'scatter');
 assert.equal(baseline.prismMeta.graphTypeSource,'series-connections');
 assert.equal(baseline.prismMeta.adapter,'scatter-grouped');
 assert.equal(baseline.prismMeta.tableFormat,'grouped');
 assert.equal(baseline.prismMeta.replicatesCount,3);
 assert.equal(baseline.importedRows[0].length,8);
 assert.equal(baseline.importedRows[1].length,8);
 assert.deepEqual(baseline.prismGraphBinary.seriesConnections.map(item=>item.connectLines),[false,false]);
 assert.equal(baseline.prismStyle.graphType,undefined);
 assert.deepEqual(baseline.prismStyle.seriesPlotTypes.map(item=>item.graphType),['','']);
 assert.deepEqual(baseline.prismStyle.seriesStyles.map(style=>style.dataSetTitle),['Control','Treated']);
 assert.deepEqual(baseline.prismStyle.seriesStyles.map(style=>style.symbolSize),[3,9]);
 assert.deepEqual(baseline.prismStyle.seriesStyles.map(style=>style.shape),['circle','square']);
 assert.equal(baseline.prismStyle.axisGeometry.x.storedUnits,800);
 assert.equal(baseline.prismStyle.axisGeometry.x.cssPixelsAt96Dpi,128);
 assert.equal(baseline.prismStyle.axisGeometry.y.storedUnits,1200);
 assert.equal(baseline.prismStyle.axisGeometry.y.cssPixelsAt96Dpi,192);
 assert.equal(baseline.prismStyle.axisThickness.points,1);
 const individual=await read(`${controlledDir}xy-individual-values-baseline.prism`);
 assert.equal(individual.prismMeta.component,'scatter');
 assert.equal(individual.prismMeta.adapter,'scatter-grouped');
 assert.deepEqual(individual.importedRows,baseline.importedRows);
 const boxplot=await read(`${controlledDir}xy-boxplot-baseline.prism`);
 assert.equal(boxplot.prismMeta.component,'scatter');
 assert.equal(boxplot.prismMeta.adapter,'scatter-grouped');
 assert.deepEqual(boxplot.importedRows,baseline.importedRows);
 const unconnected=await read(`${controlledDir}scatter-graph.prism`);
 const connected=await read(`${controlledDir}line-graph.prism`);
 assert.equal(unconnected.prismMeta.component,'scatter');
 assert.equal(connected.prismMeta.component,'line');
 assert.equal(unconnected.prismMeta.graphTypeSource,'series-connections');
 assert.equal(connected.prismMeta.graphTypeSource,'series-connections');
 assert.deepEqual(unconnected.prismGraphBinary.seriesConnections.map(item=>item.connectLines),[false,false,false]);
 assert.deepEqual(connected.prismGraphBinary.seriesConnections.map(item=>item.connectLines),[true,true,true]);
 assert.equal(unconnected.prismMeta.dataFormat,connected.prismMeta.dataFormat,
   'The paired files use the same table layout; graph connection state determines the component');
 assert.deepEqual(unconnected.importedRows.slice(1).map(row=>row.slice(1)),
   connected.importedRows.slice(1));
 const individualBaseline=await read(`${controlledDir}individual-baseline.prism`);
 const individualBar=await read(`${controlledDir}individual-baseline-bar.prism`);
 const individualBoxplot=await read(`${controlledDir}individual-baseline-boxplot.prism`);
 assert.equal(individualBar.prismMeta.graphType,'bar');
 assert.equal(individualBar.prismMeta.graphTypeSource,'pcff-record');
 assert.equal(individualBar.prismMeta.pointMode,'');
 assert.equal(individualBar.prismStyle.graphType,'bar');
 assert.equal(individualBar.prismGraphBinary.columnGraphType,'bar');
 assert.equal(individualBar.prismGraphBinary.columnPointMode,'');
 assert.deepEqual(individualBar.prismStyle.seriesPlotTypes.map(item=>item.graphType),['bar','bar','bar']);
 const individualBarOverlay=await read(`${controlledDir}individual-baseline-bar-plus-individual-value-overlay.prism`);
 assert.equal(individualBarOverlay.prismMeta.graphType,'bar');
 assert.equal(individualBarOverlay.prismMeta.pointMode,'overlay');
 assert.equal(individualBarOverlay.prismGraphBinary.columnPointMode,'overlay');
 assert.equal(individualBoxplot.prismMeta.graphType,'box');
 assert.equal(individualBoxplot.prismMeta.graphTypeSource,'pcff-record');
 assert.equal(individualBoxplot.prismStyle.graphType,'box');
 assert.equal(individualBoxplot.prismGraphBinary.columnGraphType,'box');
 assert.deepEqual(individualBoxplot.prismStyle.seriesPlotTypes.map(item=>item.graphType),['box','box','box']);
 const individualRedSquare=await read(`${controlledDir}individual-red-square.prism`);
 assert.equal(individualBaseline.prismStyle.graphType,'strip');
 assert.deepEqual(individualBaseline.prismStyle.axisTickLengths,{
   x:{code:3,storedValue:3,preset:'normal'},
   y:{code:3,storedValue:3,preset:'normal'}
 });
 const axisTextStyleCases=[
  ['individual-baseline.prism',{x:{fontSizePt:11,bold:true},y:{fontSizePt:11,bold:true}}],
  ['individual-baseline-yaxis-labels-nonbold.prism',{x:{fontSizePt:11,bold:true},y:{fontSizePt:11,bold:false}}],
  ['individual-baseline-xaxis-labels-nonbold.prism',{x:{fontSizePt:11,bold:false},y:{fontSizePt:11,bold:true}}],
  ['individual-baseline-yaxis-labels-fontsize-14.prism',{x:{fontSizePt:11,bold:true},y:{fontSizePt:14,bold:true}}],
  ['individual-baseline-xaxis-labels-fontsize-14.prism',{x:{fontSizePt:14,bold:true},y:{fontSizePt:11,bold:true}}]
 ];
 for(const [file,expected] of axisTextStyleCases){
  const variant=await read(`${controlledDir}${file}`);
  assert.deepEqual(variant.prismStyle.axisTextStyles,expected,`Axis tick-label style mismatch in ${file}`);
  assert.deepEqual(variant.prismGraphBinary.axisTextStyles,expected,`Binary summary mismatch in ${file}`);
 }
 assert.equal(individualRedSquare.prismStyle.graphType,'strip');
 assert.deepEqual(individualRedSquare.prismStyle.seriesStyles.map(style=>style.shape),['circle','circle','square']);
 assert.deepEqual(individualRedSquare.prismStyle.seriesStyles.map(style=>style.dataSetTitle),['Untreated','Placebo','Treated']);
 assert.deepEqual(individualRedSquare.prismStyle.seriesStyles.map(style=>style.symbolColor.hex),['#000000','#000000','#ff0000']);
 assert.equal(individualRedSquare.prismStyle.axisGeometry.x.storedUnits,800);
 assert.equal(individualRedSquare.prismStyle.axisGeometry.y.storedUnits,1200);
 assert.equal(individualRedSquare.prismStyle.axisThickness.points,1);
 const shortYAxisTicks=await read(`${controlledDir}individual-baseline-yaxis-ticklength-short.prism`);
 assert.deepEqual(shortYAxisTicks.prismStyle.axisTickLengths,{
   x:{code:3,storedValue:3,preset:'normal'},
   y:{code:2,storedValue:2,preset:'short'}
 });
 const sizeTwo=await read(`${controlledDir}treated-size-2.prism`);
 assert.deepEqual(sizeTwo.prismStyle.seriesStyles.map(style=>style.symbolSize),[3,2]);
 const sizeSix=await read(`${controlledDir}treated-size-6.prism`);
 assert.deepEqual(sizeSix.prismStyle.seriesStyles.map(style=>style.symbolSize),[3,6]);
 const triangleUp=await read(`${controlledDir}treated-triangle-up.prism`);
 const triangleDown=await read(`${controlledDir}treated-triangle-down.prism`);
 assert.equal(triangleUp.prismStyle.seriesStyles[1].shape,'triangle-up');
 assert.equal(triangleDown.prismStyle.seriesStyles[1].shape,'triangle-down');
 const colorExpectations=[
   ['treated-red.prism',[255,0,0,255],1],
   ['treated-blue.prism',[0,0,255,255],1],
   ['treated-red-25pct.prism',[255,0,0,191],191/255],
   ['treated-red-50pct.prism',[255,0,0,127],127/255]
 ];
 for(const [file,rgba,opacity] of colorExpectations){
   const colored=await read(`${controlledDir}${file}`);
   assert.deepEqual(colored.prismStyle.seriesStyles[0].symbolColor.rgba,[0,0,0,255]);
   assert.deepEqual(colored.prismStyle.seriesStyles[1].symbolColor.rgba,rgba);
   assert.deepEqual(colored.prismStyle.seriesStyles[1].errorColor.rgba,rgba);
   assert.ok(Math.abs(colored.prismStyle.seriesStyles[1].symbolColor.opacity-opacity)<0.0001);
 }
 const width=await read(`${controlledDir}axis-width-4cm.prism`);
 const height=await read(`${controlledDir}axis-height-6cm.prism`);
 assert.equal(width.prismStyle.axisGeometry.x.storedUnits,944);
 assert.equal(width.prismStyle.axisGeometry.x.approximateCm,4);
 assert.equal(width.prismStyle.axisGeometry.x.cssPixelsAt96Dpi,151.04);
 assert.equal(height.prismStyle.axisGeometry.y.storedUnits,1417);
 assert.equal(height.prismStyle.axisGeometry.y.approximateCm,6);
 assert.equal(height.prismStyle.axisGeometry.y.cssPixelsAt96Dpi,226.72);
 const thicknessTwo=await read(`${controlledDir}axis-thickness-2pt.prism`);
 const thicknessThree=await read(`${controlledDir}axis-thickness-3pt.prism`);
 assert.equal(thicknessTwo.prismStyle.axisThickness.points,2);
 assert.equal(thicknessThree.prismStyle.axisThickness.points,3);
 console.log('PASS: graph-linked tables, controlled marker styles, axis geometry/thickness and PZFX imports');
})().catch(e=>{console.error(e);process.exitCode=1});
