'use strict';
// Independent, dependency-free binary regression gate. Run: node scripts/test-prism-binary-contract.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const prismBinary = require('../js/shared/prismBinary.js');
const fixture = file => fs.readFileSync(path.join(__dirname, '..', '__tests__', 'fixtures', 'prism-binary', file));
const inflate = (payload, limit) => zlib.inflateSync(payload, { maxOutputLength: limit });
const clone = value => Uint8Array.from(value);
let passed = 0;
async function test(name, callback){
  try{
    await callback();
    passed += 1;
    console.log('PASS', name);
  }catch(error){
    console.error('FAIL', name);
    throw error;
  }
}
(async()=>{
  const modern = fixture('prism10_graph_data.bin');
  const narrow = fixture('prism10_axis_thickness_graph_data.bin');
  const legacy = fixture('column_pzfx_pcf.bin');
  await test('modern Prism 10 record framing 314', () => {
    const parsed = prismBinary.parseOuter(modern);
    assert.equal(parsed.records.length, 314);
    assert.equal(parsed.legacyUnclosed8003, false);
    const end = parsed.records.at(-1);
    assert.equal(end.start + end.size, modern.length);
  });
  await test('legacy PZFX known close-of-ancestor convention 375', () => {
    const parsed = prismBinary.parseOuter(legacy);
    assert.equal(parsed.records.length, 375);
    assert.equal(parsed.legacyUnclosed8003, true);
  });
  await test('Prism 10 exact duplicated axis limits', () => {
    assert.deepEqual(prismBinary.extractAxes(prismBinary.parseOuter(modern)), {
      x: { min: 1, max: 3 }, primaryY: { min: 0, max: 10 }, secondaryY: { min: 0, max: 150 }
    });
  });
  await test('Prism 6 exact duplicated axis limits', () => {
    assert.deepEqual(prismBinary.extractAxes(prismBinary.parseOuter(legacy)), {
      x: { min: 1, max: 2 }, primaryY: { min: 0, max: 150 }, secondaryY: { min: 0, max: 100 }
    });
  });
  await test('text objects and text sizes come from records', () => {
    const values = prismBinary.extractTexts(prismBinary.parseOuter(modern));
    assert.deepEqual(values.labels, {
      title: 'Individual values', xLabel: 'my different experimental conditions', yLabel: 'signal intensity'
    });
    assert.deepEqual(values.texts.map(v => v.fontSize), [14,12,12,12]);
    assert.deepEqual(values.texts.map(v => v.rotation), [null,null,90,270]);
  });
  await test('custom secondary-axis title remains identifiable by rotation', () => {
    const a=clone(modern);
    const last=prismBinary.parseOuter(a).records.filter(r=>r.type===0x002C).at(-1);
    assert.equal(last.size,7);
    a.set(Buffer.from('Y1Label','ascii'),last.start);
    const labels=prismBinary.extractTexts(prismBinary.parseOuter(a)).labels;
    assert.equal(labels.title,'Individual values');
    assert.equal(labels.yLabel,'signal intensity');
  });
  await test('Prism 1252 text labels are decoded from explicit style metadata', () => {
    const a=clone(modern);
    const label=prismBinary.parseOuter(a).records.find(r=>r.type===0x002C);
    a[label.start]=0xE9; // cp1252 é replaces one byte, preserving framing.
    const parsed=prismBinary.extractTexts(prismBinary.parseOuter(a));
    assert.ok(parsed.labels.title.startsWith('é'));
  });
  await test('legacy text objects decoded without scanning raw strings', () => {
    const values = prismBinary.extractTexts(prismBinary.parseOuter(legacy));
    assert.deepEqual(values.labels, { title: 'Data 1', xLabel: 'XTitle', yLabel: 'YTitle' });
  });
  await test('inner Zval frame exact', () => {
    const outer = prismBinary.parseOuter(modern);
    const frame = prismBinary.extractZvalFrame(outer);
    assert.equal(frame.expanded, 5959);
    assert.equal(frame.payload.length, 510);
  });
  await test('typed inner tree reads real named colors', () => {
    const outer = prismBinary.parseOuter(modern);
    const frame = prismBinary.extractZvalFrame(outer);
    const tree = prismBinary.parsePropertyTree(inflate(frame.payload, frame.expanded));
    const colors = prismBinary.colorsFromTree(tree);
    assert.equal(colors.rawNamedColors.length, 84);
    assert.ok(colors.rawNamedColors.some(c => c.key === 'PCFF_Graph::bkgndcolor'));
    assert.equal(colors.fontColor, '#000000');
  });
  await test('mixed per-axis colors are not collapsed into a guessed global color', () => {
    const frame=prismBinary.extractZvalFrame(prismBinary.parseOuter(modern));
    const tree=prismBinary.parsePropertyTree(inflate(frame.payload,frame.expanded));
    let altered=false;
    function visit(node){
      if(node instanceof Map){
        for(const [k,v] of node){
          if(!altered && k==='IPGAxSeg::textcolor' && v?.bytes?.length===4){
            v.bytes=Uint8Array.of(128,128,128,255);altered=true;
          }else visit(v);
        }
      }else if(Array.isArray(node))node.forEach(visit);
    }
    visit(tree);
    assert.equal(altered,true);
    const colors=prismBinary.colorsFromTree(tree);
    assert.equal(colors.fontColor,'');
    assert.equal(colors.axisColor,'#000000');
  });
  await test('full semantic inspection works for legacy and modern', async()=>{
    for(const b of [modern,narrow,legacy]){
      const result = await prismBinary.inspect(b, inflate);
      assert.equal(result.recordCount, b === legacy ? 375 : 314);
      assert.equal(result.textObjects.length, 4);
      assert.ok(result.axes);
    }
  });
  await test('binary metadata remains independent per call and per specimen', async()=>{
    const first = await prismBinary.inspect(modern,inflate);
    const second = await prismBinary.inspect(narrow,inflate);
    first.textObjects[0].value = 'changed by another tab';
    assert.equal(second.textObjects[0].value,'Individual values');
    assert.notEqual(first.textObjects,second.textObjects);
    assert.notEqual(first.axes,second.axes);
  });
  await test('unrelated payloads are not treated as graph binaries', async()=>{
    assert.equal(prismBinary.parseOuter(new Uint8Array([1,2,3,4])),null);
    assert.equal(await prismBinary.inspect(new Uint8Array([1,2,3,4]),inflate),null);
  });
  await test('truncated or overstated outer record length fails closed',()=>{
    const a=clone(modern); a[12]=0xFF; a[13]=0xFF; a[14]=0xFF; a[15]=0x7F;
    assert.throws(()=>prismBinary.parseOuter(a),/extends beyond/);
    assert.throws(()=>prismBinary.parseOuter(modern.subarray(0,999)),/beyond|Truncated|Unclosed/);
  });
  await test('invalid trailing closing tag fails closed',()=>{
    const a=clone(modern);a[a.length-1]=0x12;
    assert.throws(()=>prismBinary.parseOuter(a),/Unbalanced|Unclosed|Truncated/);
  });
  await test('disagreement between duplicated axis ranges is not accepted',()=>{
    const a=clone(modern);const parsed=prismBinary.parseOuter(a);
    const first=parsed.records.find(r=>r.type===0x0017);
    a[first.start+16]=0x20;
    assert.equal(prismBinary.extractAxes(prismBinary.parseOuter(a)),null);
  });
  await test('corrupted inner frame is not interpreted as a property dictionary',()=>{
    const a=clone(modern);
    const r=prismBinary.parseOuter(a).records.find(r=>r.type===0x0852);
    a[r.start+12] ^= 0x10;
    // Framing stays valid; compression/integrity rejects when parsed.
    const frame=prismBinary.extractZvalFrame(prismBinary.parseOuter(a));
    if(frame){
      assert.throws(()=>prismBinary.parsePropertyTree(inflate(frame.payload,frame.expanded)));
    }
  });
  await test('corrupted record style does not generate fabricated labels',()=>{
    const a=clone(modern),r=prismBinary.parseOuter(a).records.find(r=>r.type===0x002D);
    a[r.start+2]=0xff;a[r.start+3]=0xff;
    const value=prismBinary.extractTexts(prismBinary.parseOuter(a));
    assert.equal(value.labels.title,'');
  });
  await test('no inflater means no color decoding, not guessed values', async()=>{
    const result=await prismBinary.inspect(modern,null);
    assert.equal(result.colors.fontColor,'');
    assert.deepEqual(result.axes.primaryY,{ min:0,max:10 });
  });
  await test('inflater output length mismatch is rejected',async()=>{
    await assert.rejects(()=>prismBinary.inspect(modern,async()=>new Uint8Array(3)),/size differs/);
  });
  await test('graph selection refuses ambiguity, partial coverage, or foreign datasets', () => {
    const table={dataSets:['A1','A2'],xDataSet:'X1',rowTitlesDataSet:'R1'};
    const exclusive={id:'G1',inputDataSets:['A1','A2','X1']};
    const second={id:'G2',inputDataSets:['A1','A2']};
    const partial={id:'P',inputDataSets:['A1']};
    const foreign={id:'F',inputDataSets:['A1','A2','OTHER']};
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive]),exclusive);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,second]),null);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,partial]),null);
    assert.equal(prismBinary.selectGraphForTable(table,[foreign]),null);
    assert.equal(prismBinary.selectGraphForTable(table,[partial]),null);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,foreign]),null);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,second],'G2'),second);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,foreign],'F'),null);
    assert.equal(prismBinary.selectGraphForTable(table,[exclusive,second],'NONEXISTENT'),null);
    assert.equal(prismBinary.selectGraphForTable({dataSets:[]},[exclusive]),null);
  });
  await test('unsupported explicit Prism text code page is not guessed as UTF-8',()=>{
    const a=clone(modern);
    const style=prismBinary.parseOuter(a).records.find(r=>r.type===0x002D);
    let found=false;
    for(let i=style.start+8;i<style.start+style.size;i+=6){
      const key=a[i]|a[i+1]<<8;
      if(key===10){a[i+2]=0xE3;a[i+3]=0x04;found=true;break;} // 1251 (Cyrillic)
    }
    assert.ok(found);
    const texts=prismBinary.extractTexts(prismBinary.parseOuter(a));
    assert.equal(texts.texts.length,3);
    assert.equal(texts.labels.title,'');
  });
  await test('malformed present Zval record rejects partial graph metadata',async()=>{
    const a=clone(modern);
    const rec=prismBinary.parseOuter(a).records.find(r=>r.type===0x0852);
    a[rec.start+rec.size-1] ^= 1; // break final 'Zend', leave outer length valid
    assert.ok(prismBinary.parseOuter(a));
    await assert.rejects(()=>prismBinary.inspect(a,inflate),/Invalid Prism Zval record/);
  });
  console.log(`Prism binary contract: ${passed} tests passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
