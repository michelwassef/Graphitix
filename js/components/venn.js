(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const venn = Components.venn = Components.venn || {};
  venn.__installed = true;
  venn.ready = false;

  const NS='http://www.w3.org/2000/svg';
  const state = {
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'venn.graph',
    goChart: null,
    lastStringSVG: null,
    lastRegions: null,
    lastCounts: null,
    lastDrawMode: null
  };
  let refreshDiagramFn=null;

  venn.init = function init(){
    if (venn.ready) { console.debug('Debug: Components.venn.init skipped (already ready)'); return; }
    console.debug('Debug: Components.venn.init');
    const $ = global.$;
    const stage = global.document.getElementById('stage');
    if(!stage){ console.warn('Debug: Venn stage element missing'); return; }
    const vennContainer = stage.closest('.svgbox') || stage.parentElement;
    if(global.Shared && Shared.attachResizableBox && vennContainer){
      Shared.attachResizableBox(vennContainer);
      console.debug('Debug: venn resizer attached'); // Debug
    }
    Chart.defaults.locale='en-US';
      const inputs = {
        A: $('#listA'), B: $('#listB'), C: $('#listC'),
        labelA: $('#labelA'), labelB: $('#labelB'), labelC: $('#labelC'),
        colorA: $('#colorA'), colorB: $('#colorB'), colorC: $('#colorC'),
        opacity: $('#opacity'), fontsize: $('#fontsize'), borderColor: $('#borderColor'), borderWidth: $('#borderWidth'),
        opacityVal: $('#opacityVal'), fontsizeVal: $('#fontsizeVal'), borderWidthVal: $('#borderWidthVal'),
        caseSensitive: $('#caseSensitive'), delimiter: $('#delimiter'),
        counts: { nA: $('#nA'), nB: $('#nB'), nC: $('#nC'), nAB: $('#nAB'), nAC: $('#nAC'), nBC: $('#nBC'), nABC: $('#nABC') }
      };
      const goOptsBtn=$('#goOptsBtn'), goOptions=$('#goOptions'), goUseAllBackground=$('#goUseAllBackground');
      const goCategoryChecks=[...document.querySelectorAll('.goCategory')];
      const stringOptsBtn=$('#stringOptsBtn'), stringOptions=$('#stringOptions');
      function handlePlainPaste(e){
        e.preventDefault();
        const text=(e.clipboardData||global.clipboardData).getData('text/plain').replace(/\r/g,'').replace(/\u00A0/g,' ');
        document.execCommand('insertText', false, text);
      }
      [inputs.A,inputs.B,inputs.C].forEach(el=>el.addEventListener('paste',handlePlainPaste));
      const STYLE_KEY='vennStylePrefs';
      function loadStylePrefs(){
        try{
          const saved=JSON.parse(localStorage.getItem(STYLE_KEY));
          if(saved){
            if(saved.colorA) inputs.colorA.value=saved.colorA;
            if(saved.colorB) inputs.colorB.value=saved.colorB;
            if(saved.colorC) inputs.colorC.value=saved.colorC;
            if(saved.opacity) inputs.opacity.value=saved.opacity;
            if(saved.fontsize) inputs.fontsize.value=saved.fontsize;
            if(saved.borderColor) inputs.borderColor.value=saved.borderColor;
            if(saved.borderWidth) inputs.borderWidth.value=saved.borderWidth;
          }
          inputs.opacityVal.textContent=inputs.opacity.value;
          inputs.fontsizeVal.textContent=inputs.fontsize.value;
          inputs.borderWidthVal.textContent=inputs.borderWidth.value;
        }catch(err){}
      }
      function saveStylePrefs(){
        const prefs={
          colorA: inputs.colorA.value,
          colorB: inputs.colorB.value,
          colorC: inputs.colorC.value,
          opacity: inputs.opacity.value,
          fontsize: inputs.fontsize.value,
          borderColor: inputs.borderColor.value,
          borderWidth: inputs.borderWidth.value
        };
        try{ localStorage.setItem(STYLE_KEY, JSON.stringify(prefs)); }
        catch(err){}
      }
      loadStylePrefs();
      inputs.opacity.addEventListener('input',()=>{ inputs.opacityVal.textContent=inputs.opacity.value; refreshDiagram(); saveStylePrefs(); });
      inputs.fontsize.addEventListener('input',()=>{ inputs.fontsizeVal.textContent=inputs.fontsize.value; refreshDiagram(); saveStylePrefs(); });
      ['colorA','colorB','colorC'].forEach(id=>{
        inputs[id].addEventListener('input',e=>{ refreshDiagram(); saveStylePrefs(); });
      });
      ['labelA','labelB','labelC'].forEach(id=>{
        inputs[id].addEventListener('input',()=>{
          const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
          updateColorLabels(labels);
          updateRegionSelect(labels);
          updateCountLabels(labels);
        });
      });
      updateColorLabels({A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'});
      inputs.borderColor.addEventListener('input',e=>{ refreshDiagram(); saveStylePrefs(); });
      inputs.borderWidth.addEventListener('input',()=>{ inputs.borderWidthVal.textContent=inputs.borderWidth.value; refreshDiagram(); saveStylePrefs(); });
      function splitItems(text, mode){
        if(mode==='newline'){
          return text.split(/\r?\n/);
        }
        if(mode==='comma'){
          return text.split(/,/);
        }
        if(mode==='tab'){
          return text.split(/\t/);
        }
        if(mode==='space'){
          return text.split(/\s+/);
        }
        return text.split(/[\r\n,\t;\s]+/);
      }
      function parseList(raw, cs, mode){
        const arr = splitItems(raw.trim(), mode).map(s=>s.trim()).filter(Boolean);
        const seen=new Set(), out=[];
        for(const x of arr){
          const key=cs?x:x.toLowerCase();
          if(!seen.has(key)){
            seen.add(key);
            out.push({key,val:x});
          }
        }
        return out;
      }
      function setsFromLists(listA, listB, listC){
        const mapA=new Map(listA.map(o=>[o.key,o.val]));
        const mapB=new Map(listB.map(o=>[o.key,o.val]));
        const mapC=new Map(listC.map(o=>[o.key,o.val]));
        const keysA=new Set(mapA.keys()), keysB=new Set(mapB.keys()), keysC=new Set(mapC.keys());
        const inter=(S,T)=>new Set([...S].filter(x=>T.has(x)));
        const diff=(S,T)=>new Set([...S].filter(x=>!T.has(x)));
        const union=(S,T)=>new Set([...S,...T]);
        const ABCk=inter(inter(keysA,keysB),keysC);
        const ABk=diff(inter(keysA,keysB),keysC);
        const ACk=diff(inter(keysA,keysC),keysB);
        const BCk=diff(inter(keysB,keysC),keysA);
        const Aonlyk=diff(keysA,union(keysB,keysC));
        const Bonlyk=diff(keysB,union(keysA,keysC));
        const Conlyk=diff(keysC,union(keysA,keysB));
        const mapVal=(keys,map)=>new Set([...keys].map(k=>map.get(k)));
        const res={
          A:mapVal(keysA,mapA),
          B:mapVal(keysB,mapB),
          C:mapVal(keysC,mapC),
          Aonly:mapVal(Aonlyk,mapA),
          Bonly:mapVal(Bonlyk,mapB),
          Conly:mapVal(Conlyk,mapC),
          AB:mapVal(ABk,mapA),
          AC:mapVal(ACk,mapA),
          BC:mapVal(BCk,mapB),
          ABC:mapVal(ABCk,mapA)
        };
        return res;
      }
      function circleIntersectionArea(r1,r2,d){
        if(d>=r1+r2) return 0;
        if(d<=Math.abs(r1-r2)) return Math.PI*Math.min(r1,r2)**2;
        const a=2*Math.acos((r1*r1+d*d-r2*r2)/(2*r1*d));
        const b=2*Math.acos((r2*r2+d*d-r1*r1)/(2*r2*d));
        return 0.5*r1*r1*(a-Math.sin(a)) + 0.5*r2*r2*(b-Math.sin(b));
      }
      function distanceForOverlap(r1,r2,target){
        const maxA=Math.PI*Math.min(r1,r2)**2;
        const t=Math.max(0,Math.min(target,maxA));
        let lo=Math.max(0,Math.abs(r1-r2)), hi=r1+r2;
        for(let i=0;i<60;i++){ const m=(lo+hi)/2; const A=circleIntersectionArea(r1,r2,m); if(A>t) lo=m; else hi=m; }
        return (lo+hi)/2;
      }
      function trilaterate(dAB,dAC,dBC){
        const x=(dAB*dAB+dAC*dAC-dBC*dBC)/(2*(dAB||1e-6));
        const y2=dAC*dAC-x*x; return {Ax:0,Ay:0,Bx:dAB,By:0,Cx:x,Cy:Math.sqrt(Math.max(0,y2))};
      }
      function layoutFromCounts(nA,nB,nC,nAB,nAC,nBC){
        const rA=Math.sqrt(Math.max(nA,0)/Math.PI);
        const rB=Math.sqrt(Math.max(nB,0)/Math.PI);
        const rC=Math.sqrt(Math.max(nC,0)/Math.PI);
        const dAB=distanceForOverlap(rA,rB,Math.max(nAB,0));
        const dAC=distanceForOverlap(rA,rC,Math.max(nAC,0));
        const dBC=distanceForOverlap(rB,rC,Math.max(nBC,0));
        return {...trilaterate(dAB,dAC,dBC), rA,rB,rC,dAB,dAC,dBC};
      }
      function clearSVG(){ while(stage.firstChild) stage.removeChild(stage.firstChild); }
      function makeEl(tag,attrs={},parent=stage){ const el=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); parent.appendChild(el); return el; }
      function enableDrag(el){ let drag=false,start={x:0,y:0},orig={x:0,y:0}; el.style.cursor='move';
        el.addEventListener('mousedown',e=>{drag=true; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); start={x:loc.x,y:loc.y}; orig={x:parseFloat(el.getAttribute('x')||'0'),y:parseFloat(el.getAttribute('y')||'0')}; e.preventDefault();});
        global.addEventListener('mousemove',e=>{ if(!drag) return; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); el.setAttribute('x',String(orig.x+(loc.x-start.x))); el.setAttribute('y',String(orig.y+(loc.y-start.y))); });
        global.addEventListener('mouseup',()=>drag=false);
      }
      function _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC){
        const spec = [];
        const inC  = (ctr,r)=>spec.push({ctr, r, type:'in'});
        const outC = (ctr,r)=>spec.push({ctr, r, type:'out'});
        if(code==='A'){ inC(cA,rA); outC(cB,rB); if(hasC) outC(cC,rC); }
        if(code==='B'){ inC(cB,rB); outC(cA,rA); if(hasC) outC(cC,rC); }
        if(code==='C'){ inC(cC,rC); outC(cA,rA); outC(cB,rB); }
        if(code==='AB'){ inC(cA,rA); inC(cB,rB); if(hasC) outC(cC,rC); }
        if(code==='AC'){ inC(cA,rA); if(hasC) inC(cC,rC); outC(cB,rB); }
        if(code==='BC'){ inC(cB,rB); if(hasC) inC(cC,rC); outC(cA,rA); }
        if(code==='ABC'){ inC(cA,rA); inC(cB,rB); if(hasC) inC(cC,rC); }
        return spec;
      }
      function _signedDistToRegion(x, y, spec){
        let minMargin = Infinity;
        for(const c of spec){
          const dist = Math.hypot(x - c.ctr.x, y - c.ctr.y);
          const margin = (c.type === 'in') ? (c.r - dist) : (dist - c.r);
          if(margin < minMargin) minMargin = margin;
        }
        return minMargin;
      }
      function _bboxForSpec(spec){
        const ins = spec.filter(c => c.type === 'in');
        if(!ins.length) return null;
        let b = {x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity};
        for(const c of ins){
          const bb = {x1: c.ctr.x - c.r, y1: c.ctr.y - c.r, x2: c.ctr.x + c.r, y2: c.ctr.y + c.r};
          b = { x1: Math.max(b.x1, bb.x1), y1: Math.max(b.y1, bb.y1),
                x2: Math.min(b.x2, bb.x2), y2: Math.min(b.y2, bb.y2) };
        }
        if(b.x1 >= b.x2 || b.y1 >= b.y2) return null;
        return b;
      }
      function _polylabelRegion(spec, bbox, tolerancePx){
        function makeCell(x, y, h){
          const d = _signedDistToRegion(x, y, spec);
          return {x, y, h, d, max: d + h*Math.SQRT2};
        }
        const width  = bbox.x2 - bbox.x1;
        const height = bbox.y2 - bbox.y1;
        const size   = Math.max(width, height);
        const h0     = size / 2;
        const nInit  = 4;
        const step   = size / nInit;
        const queue = [];
        function push(c){ queue.push(c); }
        function pop(){ queue.sort((a,b)=>b.max - a.max); return queue.shift(); }
        for(let x = bbox.x1; x < bbox.x2 + 1e-6; x += step){
          for(let y = bbox.y1; y < bbox.y2 + 1e-6; y += step){
            push(makeCell(x + step/2, y + step/2, step/2));
          }
        }
        let best = makeCell((bbox.x1+bbox.x2)/2, (bbox.y1+bbox.y2)/2, h0);
        if(best.d < 0){
          for(const c of queue){ if(c.d > best.d) best = c; }
        }
        while(queue.length){
          const cell = pop();
          if(cell.d > best.d) best = cell;
          if(cell.max - best.d <= tolerancePx) continue;
          const h = cell.h / 2;
          push(makeCell(cell.x - h, cell.y - h, h));
          push(makeCell(cell.x + h, cell.y - h, h));
          push(makeCell(cell.x - h, cell.y + h, h));
          push(makeCell(cell.x + h, cell.y + h, h));
        }
        return {x: best.x, y: best.y};
      }
      function _findRegionLabelPoint(code, cA, rA, cB, rB, cC, rC, hasC, tolerancePx){
        const spec = _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC);
        const bbox = _bboxForSpec(spec);
        if(!bbox) return null;
        const tol = Math.max(0.25, tolerancePx||0.5);
        const pt  = _polylabelRegion(spec, bbox, tol);
        return pt;
      }
      function fitAndDraw(d, style, labels, counts){
        clearSVG();
        const W=500,H=340,pad=20,labelPad=style.fontsize*2;
        const xs=[d.Ax-d.rA,d.Ax+d.rA,d.Bx-d.rB,d.Bx+d.rB]; const ys=[d.Ay-d.rA,d.Ay+d.rA,d.By-d.rB,d.By+d.rB];
        if(counts.nC>0){ xs.push(d.Cx-d.rC,d.Cx+d.rC); ys.push(d.Cy-d.rC,d.Cy+d.rC); }
        const minX=Math.min.apply(null,xs), maxX=Math.max.apply(null,xs);
        const minY=Math.min.apply(null,ys), maxY=Math.max.apply(null,ys);
        const scale=Math.min((W-2*pad)/Math.max(1e-6,maxX-minX),(H-2*pad-2*labelPad)/Math.max(1e-6,maxY-minY));
        const tx=(W-scale*(minX+maxX))/2;
        const ty=(H-2*labelPad-scale*(minY+maxY))/2+labelPad;
        function toPx(x,y){ return {x:x*scale+tx,y:y*scale+ty}; }
        const circles=[{id:'A',x:d.Ax,y:d.Ay,r:d.rA,color:style.colorA},{id:'B',x:d.Bx,y:d.By,r:d.rB,color:style.colorB}];
        if(counts.nC>0) circles.push({id:'C',x:d.Cx,y:d.Cy,r:d.rC,color:style.colorC});
        for(const c of circles){ const p=toPx(c.x,c.y); makeEl('circle',{cx:p.x,cy:p.y,r:c.r*scale,fill:c.color,'fill-opacity':style.opacity,stroke:style.borderColor,'stroke-width':style.borderWidth}); }
        function addText(txt,x,y,regionCode){
          const t=makeEl('text',{x:x,y:y,'font-size':style.fontsize,'text-anchor':'middle',fill:'#333'});
          t.textContent=txt;
          if(regionCode){
            const genes=getRegionText(regionCode).split(/\n/).filter(g=>g);
            t.addEventListener('mouseenter',e=>{
              tooltip.innerHTML=genes.map(g=>'<div>'+g+'</div>').join('');
              tooltip.style.fontSize='12px';
              tooltip.style.maxHeight='none';
              tooltip.style.maxWidth='none';
              tooltip.style.overflow='visible';
              tooltip.style.width='auto';
              tooltip.style.height='auto';
              const lineHeight=parseFloat(getComputedStyle(tooltip).lineHeight);
              const tempSpan=document.createElement('span');
              tempSpan.style.visibility='hidden';
              tempSpan.style.position='absolute';
              tempSpan.style.fontSize='12px';
              tempSpan.style.whiteSpace='pre';
              document.body.appendChild(tempSpan);
              let longestWidth=0;
              genes.forEach(g=>{ tempSpan.textContent=g; const w=tempSpan.getBoundingClientRect().width; if(w>longestWidth) longestWidth=w; });
              document.body.removeChild(tempSpan);
              const columnGap=12;
              const columnWidth=Math.ceil(longestWidth)+16;
              const maxWidth=global.innerWidth-16, maxHeight=global.innerHeight-16;
              const maxCols=Math.max(1,Math.floor((maxWidth+columnGap)/(columnWidth+columnGap)));
              const maxRows=Math.max(1,Math.floor(maxHeight/lineHeight));
              let columns=Math.min(maxCols,Math.ceil(genes.length/maxRows));
              let rowsPerCol=Math.ceil(genes.length/columns);
              const width=columns*columnWidth+(columns-1)*columnGap;
              const height=rowsPerCol*lineHeight;
              tooltip.style.columnCount=columns;
              tooltip.style.columnWidth=columnWidth+'px';
              tooltip.style.columnGap=columnGap+'px';
              tooltip.style.width=width+'px';
              tooltip.style.height=height+'px';
              const box=e.target.getBoundingClientRect();
              let left=box.right+global.scrollX+8;
              let top=box.top+global.scrollY;
              tooltip.style.left=left+'px';
              tooltip.style.top=top+'px';
              tooltip.style.display='block';
              positionTooltip(left, top);
            });
            t.addEventListener('mouseleave',()=>{
              tooltip.style.display='none';
            });
          }
          enableDrag(t);
          return t;
        }
        const labelBoxes=[];
        function placeCircleLabel(circle,label,count){
          const center=toPx(circle.x,circle.y);
          const others=circles.filter(c=>c.id!==circle.id);
          const isTop=others.every(o=>circle.y<=o.y);
          const margin=style.fontsize*0.6;
            let y=center.y+(isTop?-(circle.r*scale+margin):(circle.r*scale+margin));
            const t=addText(label+' ('+count+')',center.x,y);
            let box=t.getBBox();
            for(const b of labelBoxes){
              while(!(box.x+box.width<b.x||b.x+b.width<box.x||box.y+box.height<b.y||b.y+b.height<box.y)){
                y+=isTop?-style.fontsize:style.fontsize;
                t.setAttribute('y',y);
                box=t.getBBox();
              }
            }
            const minYBound=style.fontsize;
            const maxYBound=H-style.fontsize;
            if(box.y<minYBound){
              y+=minYBound-box.y;
              t.setAttribute('y',y);
              box=t.getBBox();
            }
            if(box.y+box.height>maxYBound){
              y-=box.y+box.height-maxYBound;
              t.setAttribute('y',y);
              box=t.getBBox();
            }
            labelBoxes.push(box);
        }
        placeCircleLabel({id:'A',x:d.Ax,y:d.Ay,r:d.rA},labels.A,counts.nA);
        placeCircleLabel({id:'B',x:d.Bx,y:d.By,r:d.rB},labels.B,counts.nB);
        if(counts.nC>0) placeCircleLabel({id:'C',x:d.Cx,y:d.Cy,r:d.rC},labels.C,counts.nC);
        const cA=toPx(d.Ax,d.Ay), cB=toPx(d.Bx,d.By), cC=toPx(d.Cx,d.Cy);
        const rAp=d.rA*scale, rBp=d.rB*scale, rCp=d.rC*scale;
        const hasC = counts.nC > 0;
        if(counts.Aonly){
          const p = _findRegionLabelPoint('A', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.Aonly), p.x, p.y, 'A');
        }
        if(counts.Bonly){
          const p = _findRegionLabelPoint('B', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.Bonly), p.x, p.y, 'B');
        }
        if(hasC && counts.Conly){
          const p = _findRegionLabelPoint('C', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.Conly), p.x, p.y, 'C');
        }
        if(counts.AB){
          const p = _findRegionLabelPoint('AB', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.AB), p.x, p.y, 'AB');
        }
        if(hasC && counts.AC){
          const p = _findRegionLabelPoint('AC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.AC), p.x, p.y, 'AC');
        }
        if(hasC && counts.BC){
          const p = _findRegionLabelPoint('BC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.BC), p.x, p.y, 'BC');
        }
        if(hasC && counts.ABC){
          const p = _findRegionLabelPoint('ABC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
          if(p) addText(String(counts.ABC), p.x, p.y, 'ABC');
        }
        stage.onclick=(evt)=>{
          const pt=stage.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse());
          const inA=Math.hypot(loc.x-cA.x,loc.y-cA.y)<=rAp, inB=Math.hypot(loc.x-cB.x,loc.y-cB.y)<=rBp, inC=(counts.nC>0)&&Math.hypot(loc.x-cC.x,loc.y-cC.y)<=rCp;
          let region=null;
          if(inA&&!inB&&!inC) region='A'; else if(!inA&&inB&&!inC) region='B'; else if(!inA&&!inB&&inC) region='C';
          else if(inA&&inB&&!inC) region='AB'; else if(inA&&inC&&!inB) region='AC'; else if(inB&&inC&&!inA) region='BC'; else if(inA&&inB&&inC) region='ABC';
          if(region){ $('#regionSelect').value=region; populateRegion(region); }
        };
      }
      function exportSVG(){
        const xml=new XMLSerializer().serializeToString(stage);
        const blob=new Blob([xml],{type:'image/svg+xml'});
        const url=URL.createObjectURL(blob);
        downloadURL(url,'venn.svg');
        setTimeout(()=>URL.revokeObjectURL(url),5000);
      }
      function exportPNG(){
        const xml=new XMLSerializer().serializeToString(stage);
        const img=new Image();
        img.onload=function(){
          const c=document.createElement('canvas');
          c.width=stage.viewBox.baseVal.width; c.height=stage.viewBox.baseVal.height;
          const ctx=c.getContext('2d');
          ctx.drawImage(img,0,0);
          c.toBlob(b=>{ const url=URL.createObjectURL(b); downloadURL(url,'venn.png'); setTimeout(()=>URL.revokeObjectURL(url),5000); },'image/png');
        };
        img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
      }
      function downloadURL(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
      function downloadJSON(obj,name){
        console.log('downloadJSON', name);
        const blob=new Blob([JSON.stringify(obj)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        downloadURL(url,name);
        setTimeout(()=>URL.revokeObjectURL(url),5000);
      }
      async function verifyPermission(handle,write){
        try{
          console.log('verifyPermission',{handle,write});
          const opts=write?{mode:'readwrite'}:{};
          const q=await handle.queryPermission(opts);
          console.log('verifyPermission query',q);
          if(q==='granted') return true;
          const r=await handle.requestPermission(opts);
          console.log('verifyPermission request',r);
          return r==='granted';
        }catch(err){
          console.error('verifyPermission error',err);
          return false;
        }
      }
      function getVennGraphPayload(){
        return {
          type:'venn',
          data:{
            labelA:inputs.labelA.value,
            labelB:inputs.labelB.value,
            labelC:inputs.labelC.value,
            listA:inputs.A.value,
            listB:inputs.B.value,
            listC:inputs.C.value,
            nA:inputs.counts.nA.value,
            nB:inputs.counts.nB.value,
            nC:inputs.counts.nC.value,
            nAB:inputs.counts.nAB.value,
            nAC:inputs.counts.nAC.value,
            nBC:inputs.counts.nBC.value,
            nABC:inputs.counts.nABC.value
          },
          style:{
            colorA:inputs.colorA.value,
            colorB:inputs.colorB.value,
            colorC:inputs.colorC.value,
            opacity:inputs.opacity.value,
            borderColor:inputs.borderColor.value,
            borderWidth:inputs.borderWidth.value,
            fontsize:inputs.fontsize.value
          }
        };
      }
      let vennFileHandle=null, vennFileName='venn.graph';
      async function saveVennFile(){
        const payload=getVennGraphPayload();
        console.log('saveVennFile',{payload,vennFileHandle});
        if(vennFileHandle&&vennFileHandle.createWritable){
          try{
            const perm=await verifyPermission(vennFileHandle,true);
            console.log('saveVennFile permission',perm);
            if(perm){
              const w=await vennFileHandle.createWritable();
              await w.write(JSON.stringify(payload));
              await w.close();
            }
          }catch(err){console.error('saveVennFile error',err);}
        }else if(global.showSaveFilePicker){
          console.log('saveVennFile no handle - invoking saveAs');
          await saveAsVennFile();
        }else{
          console.log('saveVennFile fallback download');
          downloadJSON(payload,vennFileName);
        }
      }
      async function saveAsVennFile(){
        const payload=getVennGraphPayload();
        console.log('saveAsVennFile',payload);
        if(global.showSaveFilePicker){
          try{
            vennFileHandle=await global.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:vennFileName});
            const w=await vennFileHandle.createWritable();
            await w.write(JSON.stringify(payload));
            await w.close();
          }catch(err){console.error('saveAsVennFile error',err);}
        }else{
          downloadJSON(payload,vennFileName);
        }
      }
      async function openVennFile(){
        console.log('openVennFile start');
        if(global.showOpenFilePicker){
          try{
            [vennFileHandle]=await global.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]});
            const file=await vennFileHandle.getFile();
            vennFileName=file.name;
            loadVennGraphFile(file);
          }catch(err){console.error('openVennFile error',err);}
        }else{
          const input=document.getElementById('vennGraphFile');
          input.value='';
          input.click();
        }
      }
      function loadVennGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            console.log('loadVennGraph',obj);
            if(obj.type!=='venn') throw new Error('Invalid graph type');
            const d=obj.data||{};
            inputs.labelA.value=d.labelA||'';
            inputs.labelB.value=d.labelB||'';
            inputs.labelC.value=d.labelC||'';
            inputs.A.value=d.listA||'';
            inputs.B.value=d.listB||'';
            inputs.C.value=d.listC||'';
            const c=inputs.counts;
            c.nA.value=d.nA||0; c.nB.value=d.nB||0; c.nC.value=d.nC||0;
            c.nAB.value=d.nAB||0; c.nAC.value=d.nAC||0; c.nBC.value=d.nBC||0; c.nABC.value=d.nABC||0;
            const s=obj.style||{};
            inputs.colorA.value=s.colorA||inputs.colorA.value;
            inputs.colorB.value=s.colorB||inputs.colorB.value;
            inputs.colorC.value=s.colorC||inputs.colorC.value;
            inputs.opacity.value=s.opacity||inputs.opacity.value; inputs.opacityVal.textContent=inputs.opacity.value;
            inputs.borderColor.value=s.borderColor||inputs.borderColor.value;
            inputs.borderWidth.value=s.borderWidth||inputs.borderWidth.value; inputs.borderWidthVal.textContent=inputs.borderWidth.value;
            inputs.fontsize.value=s.fontsize||inputs.fontsize.value; inputs.fontsizeVal.textContent=inputs.fontsize.value;
            refreshDiagram();
          }catch(err){console.error('loadVennGraph error',err);}
        };
        reader.readAsText(file);
      }
      function exportGoChart(format){
        if(!state.goChart) return;
        const canvas=document.getElementById('goChart');
        let url;
        if(format==='png'){
          url=canvas.toDataURL('image/png');
        }else if(format==='svg'){
          try{
            const {labels}=state.goChart.data;
            const values=state.goChart.data.datasets[0].data;
            const color=state.goChart.data.datasets[0].backgroundColor;
            const width=canvas.width, height=canvas.height;
            const measureCtx=document.createElement('canvas').getContext('2d');
            measureCtx.font='12px sans-serif';
            const labelWidths=labels.map(l=>measureCtx.measureText(l).width);
            const maxLabelWidth=Math.ceil(Math.max(...labelWidths));
            const padding={left:maxLabelWidth+12,right:20,top:10,bottom:30};
            const chartWidth=width-padding.left-padding.right;
            const chartHeight=height-padding.top-padding.bottom;
            const barHeight=chartHeight/labels.length;
            const maxVal=Math.max(...values);
            let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
            svg+=`<rect width="${width}" height="${height}" fill="white"/>`;
            for(let i=0;i<labels.length;i++){
              const y=padding.top+i*barHeight;
              const barWidth=(values[i]/maxVal)*chartWidth;
              svg+=`<text x="4" y="${y+barHeight/2}" dominant-baseline="middle" font-size="12">${labels[i]}</text>`;
              svg+=`<rect x="${padding.left}" y="${y+barHeight*0.1}" width="${barWidth}" height="${barHeight*0.8}" fill="${color}"/>`;
              svg+=`<text x="${padding.left+barWidth+4}" y="${y+barHeight/2}" dominant-baseline="middle" font-size="12">${values[i].toFixed(2)}</text>`;
            }
            const axisY=padding.top+chartHeight;
            svg+=`<line x1="${padding.left}" y1="${axisY}" x2="${width-padding.right}" y2="${axisY}" stroke="black"/>`;
            svg+=`<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${axisY}" stroke="black"/>`;
            const ticks=5;
            for(let t=0;t<=ticks;t++){
              const v=(maxVal/ticks)*t;
              const x=padding.left+(v/maxVal)*chartWidth;
              svg+=`<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY+5}" stroke="black"/>`;
              svg+=`<text x="${x}" y="${axisY+15}" font-size="12" text-anchor="middle">${v.toFixed(2)}</text>`;
            }
            svg+=`<text x="${padding.left+chartWidth/2}" y="${height-5}" font-size="12" text-anchor="middle">-log10(p)</text>`;
            svg+='</svg>';
            const blob=new Blob([svg],{type:'image/svg+xml'});
            url=URL.createObjectURL(blob);
          }catch(err){
            return;
          }
        }
        downloadURL(url,'go_chart.'+format);
        if(format==='svg'){ setTimeout(()=>URL.revokeObjectURL(url),5000); }
      }
      async function downloadStringPNG(){
        if(!state.lastStringSVG) return;
        const svgBlob=new Blob([state.lastStringSVG],{type:'image/svg+xml'});
        const url=URL.createObjectURL(svgBlob);
        const img=new Image();
        img.src=url;
        await img.decode().catch(err=>{});
        const canvas=document.createElement('canvas');
        canvas.width=img.width; canvas.height=img.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        URL.revokeObjectURL(url);
        canvas.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); downloadURL(pngUrl,'string_network.png'); setTimeout(()=>URL.revokeObjectURL(pngUrl),5000); },'image/png');
      }
      function downloadStringSVG(){
        if(!state.lastStringSVG) return;
        const blob=new Blob([state.lastStringSVG],{type:'image/svg+xml'});
        const url=URL.createObjectURL(blob);
        downloadURL(url,'string_network.svg');
        setTimeout(()=>URL.revokeObjectURL(url),5000);
      }
      const countsUI={A:$('#countA'),B:$('#countB'),C:$('#countC'),AB:$('#countAB'),AC:$('#countAC'),BC:$('#countBC'),ABC:$('#countABC')};
      const regionSelect=$('#regionSelect'), regionList=$('#regionList'), copyRegionBtn=$('#copyRegionBtn'), analysisResults=$('#analysisResults'), goBtn=$('#goBtn'), stringBtn=$('#stringBtn'), goResults=$('#goResults'), stringNetwork=$('#stringNetwork'), stringResults=$('#stringResults'), speciesSelect=$('#speciesSelect'), goChartExport=$('#goChartExport'), stringNetworkExport=$('#stringNetworkExport');
      const tooltip=$('#tooltip');
      const totalGenesInput=$('#totalGenes'), calcSignificanceBtn=$('#calcSignificance'), significanceResults=$('#significanceResults');
      let lastGOResult=null, lastGOFormatted=[], lastGOOrganism='hsapiens';
      state.goChart=null; state.lastStringSVG=null;
      document.addEventListener('click',e=>{
        if(tooltip.style.display==='block' && !tooltip.contains(e.target)){
          tooltip.style.display='none';
        }
      });
      copyRegionBtn.addEventListener('click',()=>{
        const text=getRegionText(regionSelect.value);
        navigator.clipboard.writeText(text).then(()=>{}).catch(err=>{});
      });
      goOptsBtn.addEventListener('click',()=>{
        const show=goOptions.style.display==='none';
        goOptions.style.display=show?'block':'none';
      });
      stringOptsBtn.addEventListener('click',()=>{
        const show=stringOptions.style.display==='none';
        stringOptions.style.display=show?'block':'none';
      });
      ['A','B','C'].forEach(k=>{
        inputs[k].addEventListener('input',()=>{
          speciesSelect.value='';
        });
      });
      const uniProtCache={};
      function positionTooltip(x,y){
        let left=x, top=y;
        tooltip.style.left=left+'px';
        tooltip.style.top=top+'px';
        const rect=tooltip.getBoundingClientRect();
        const rightBound=global.scrollX+global.innerWidth-8;
        const bottomBound=global.scrollY+global.innerHeight-8;
        if(rect.right>rightBound){ left=Math.max(global.scrollX+8,rightBound-rect.width); }
        if(rect.bottom>bottomBound){ top=Math.max(global.scrollY+8,bottomBound-rect.height); }
        tooltip.style.left=left+'px';
        tooltip.style.top=top+'px';
      }
      async function fetchUniProtFunction(gene){
        const q=gene.toUpperCase();
        if(uniProtCache[q]) return uniProtCache[q];
        try{
          const url=`https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(q)}+AND+reviewed:true&fields=cc_function&format=json&size=1`;
          const resp=await fetch(url);
          if(!resp.ok) return null;
          const data=await resp.json();
          const value=data.results?.[0]?.comments?.find(c=>c.commentType==='FUNCTION')?.texts?.[0]?.value||null;
          uniProtCache[q]=value;
          return value;
        }catch(err){ return null; }
      }
      regionList.addEventListener('mouseover',async e=>{
        const link=e.target.closest('.gene-link');
        if(link&&regionList.contains(link)){
          const gene=link.dataset.gene;
          const fn=await fetchUniProtFunction(gene);
          tooltip.innerHTML=fn?`<strong>${gene}</strong><br>${fn}`:`<strong>${gene}</strong><br><i>Function not found</i>`;
          tooltip.style.fontSize='12px';
          tooltip.style.maxHeight='none';
          tooltip.style.overflow='visible';
          tooltip.style.columnCount=1;
          tooltip.style.columnWidth='auto';
          tooltip.style.columnGap='0';
          tooltip.style.width='auto';
          tooltip.style.height='auto';
          tooltip.style.whiteSpace='normal';
          let left=e.pageX+8;
          let top=e.pageY+8;
          tooltip.style.left=left+'px';
          tooltip.style.top=top+'px';
          tooltip.style.display='block';
          requestAnimationFrame(()=>{
            const w=tooltip.scrollWidth;
            const h=tooltip.scrollHeight;
            tooltip.style.width=w+'px';
            tooltip.style.height=h+'px';
            positionTooltip(left, top);
          });
        }
      });
      regionList.addEventListener('mouseout',e=>{
        const link=e.target.closest('.gene-link');
        if(link&&regionList.contains(link)){
          tooltip.style.display='none';
        }
      });
      regionList.addEventListener('click',async e=>{
        const link=e.target.closest('.gene-link');
        if(link&&regionList.contains(link)){
          const gene=link.dataset.gene;
          const taxId=speciesSelect.selectedOptions[0].dataset.string||'9606';
          const apiUrl=`https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(gene)}+AND+organism_id:${taxId}+AND+reviewed:true&fields=accession&format=json&size=1`;
          try{
            const resp=await fetch(apiUrl);
            const data=await resp.json();
            const acc=data.results?.[0]?.primaryAccession;
            const url=acc?`https://www.uniprot.org/uniprotkb/${acc}/entry`:`https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
            global.open(url,'_blank','noopener');
          }catch(err){
            const url=`https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
            global.open(url,'_blank','noopener');
          }
        }
      });
      const goBtnTip='Sends the selected species and gene list to g:Profiler GOSt, returns all GO categories and default sources, and displays the top five terms by significance.';
      goBtn.addEventListener('mouseenter',()=>{
        tooltip.innerHTML=goBtnTip;
        tooltip.style.fontSize='12px';
        tooltip.style.maxHeight='none';
        tooltip.style.overflow='visible';
        tooltip.style.columnCount=1;
        tooltip.style.columnWidth='auto';
        tooltip.style.width='max-content';
        tooltip.style.height='auto';
        tooltip.style.visibility='hidden';
        tooltip.style.display='block';
        const rect=goBtn.getBoundingClientRect();
        let left=rect.right+global.scrollX+8;
        let top=rect.top+global.scrollY;
        tooltip.style.left=left+'px';
        tooltip.style.top=top+'px';
        positionTooltip(left, top);
        let tRect=tooltip.getBoundingClientRect();
        const overlaps=!(tRect.right<rect.left || tRect.left>rect.right || tRect.bottom<rect.top || tRect.top>rect.bottom);
        if(overlaps){
          left=rect.left+global.scrollX;
          top=rect.bottom+global.scrollY+8;
          tooltip.style.left=left+'px';
          tooltip.style.top=top+'px';
          positionTooltip(left, top);
          tRect=tooltip.getBoundingClientRect();
          const stillOverlap=!(tRect.right<rect.left || tRect.left>rect.right || tRect.bottom<rect.top || tRect.top>rect.bottom);
          if(stillOverlap){
            top=rect.top+global.scrollY-tRect.height-8;
            tooltip.style.left=left+'px';
            tooltip.style.top=top+'px';
            positionTooltip(left, top);
          }
        }
        tooltip.style.visibility='visible';
      });
      goBtn.addEventListener('mouseleave',()=>{
        tooltip.style.display='none';
      });
      function renderGOChart(limit=5){
        if(!lastGOResult||!lastGOResult.length){
          document.getElementById('goChart').style.display='none';
          document.getElementById('goChartExport').style.display='none';
          if(state.goChart){ state.goChart.destroy(); state.goChart=null; }
          return;
        }
        const data=lastGOResult.slice(0,limit);
        const labels=data.map(r=>r.term_name||r.name||'');
        const values=data.map(r=>-Math.log10(r.p_value));
        const barColor='#64b5f6';
        if(state.goChart){ state.goChart.destroy(); }
        document.getElementById('goChart').style.display='block';
        document.getElementById('goChartExport').style.display='flex';
        const isAll=limit>5;
        const baseBarHeight=25;
        const minBarHeight=18;
        const barHeight=isAll?minBarHeight:baseBarHeight;
        const chartHeight=Math.max(300,barHeight*labels.length);
        const canvas=document.getElementById('goChart');
        canvas.style.height=chartHeight+'px';
        canvas.height=chartHeight;
        canvas.width=canvas.offsetWidth;
        const ctx=canvas.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0);
        const config={
          type:'bar',
          data:{labels,datasets:[{label:'-log10(p)',data:values,backgroundColor:barColor,barThickness:barHeight-5}]},
          options:{
            indexAxis:'y',
            responsive:false,
            maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              x:{
                title:{display:true,text:'-log10(p)'},
                grid:{display:false},
                ticks:{callback:v=>v.toLocaleString('en-US',{maximumFractionDigits:2})}
              },
              y:{grid:{display:false},ticks:{autoSkip:false}}
            }
          },
          locale:'en-US'
        };
        state.goChart=new Chart(ctx,config);
      }
      function renderGOResults(limit=5){
        if(!lastGOResult||!lastGOResult.length){ goResults.innerHTML='<div>No GO results</div>'; return; }
        const items=lastGOResult.slice(0,limit).map(r=>{
          const term=r.term_name||r.name||'unknown term';
          const src=r.source||'unknown source';
          return `<div>${term} [${src}] (p=${Number(r.p_value).toExponential(2)})</div>`;
        }).join('');
        const fullUrl=`https://biit.cs.ut.ee/gprofiler/gost?organism=${lastGOOrganism}&query=${encodeURIComponent(lastGOFormatted.join('\n'))}`;
        const link=`<div><a href="${fullUrl}" target="_blank" rel="noopener">View full GO analysis</a>${lastGOResult.length>5?` | <button class="btn" id="toggleGoResults" data-state="${limit===5?'top5':'all'}">${limit===5?'Show all results':'Show top 5'}</button>`:''}</div>`;
        goResults.innerHTML=`<strong>${limit===5?'Top 5 GO terms':'All GO terms'}</strong>`+items+link;
        renderGOChart(limit);
      }
      goResults.addEventListener('click',e=>{
        if(e.target.id==='toggleGoResults'){
          const state=e.target.dataset.state;
          if(state==='top5'){ renderGOResults(lastGOResult.length); }
          else{ renderGOResults(5); }
        }
      });
      function clearAnalysis(){
        goResults.innerHTML='';
        stringResults.innerHTML='';
        stringNetwork.innerHTML='';
        if(state.goChart){ state.goChart.destroy(); state.goChart=null; }
        const canvas=document.getElementById('goChart');
        canvas.style.display='none';
        goChartExport.style.display='none';
        stringNetworkExport.style.display='none';
      }
      regionSelect.addEventListener('change',()=>{ populateRegion(regionSelect.value); });
      speciesSelect.addEventListener('change',()=>{});
      state.lastRegions=null; state.lastDrawMode=null; state.lastCounts=null;
      function refreshDiagram(){
        if(!state.lastDrawMode) return;
        if(state.lastDrawMode==='lists') drawFromLists(); else drawFromNumeric();
      }
      function populateRegion(code){
        clearAnalysis();
        if(!state.lastRegions) return;
        const map={A:state.lastRegions.Aonly,B:state.lastRegions.Bonly,C:state.lastRegions.Conly,AB:state.lastRegions.AB,AC:state.lastRegions.AC,BC:state.lastRegions.BC,ABC:state.lastRegions.ABC};
        const arr=[...(map[code]||new Set())].sort();
        regionList.innerHTML=arr.length?arr.map(x=>`<div class="gene-item">${x}<span class="gene-link" data-gene="${x}">&#128279;</span></div>`).join(''):'(empty)';
        copyRegionBtn.style.display=arr.length?'block':'none';
      }
      function getRegionText(code){
        if(!state.lastRegions) return '';
        const map={A:state.lastRegions.Aonly,B:state.lastRegions.Bonly,C:state.lastRegions.Conly,AB:state.lastRegions.AB,AC:state.lastRegions.AC,BC:state.lastRegions.BC,ABC:state.lastRegions.ABC};
        const genes=[...(map[code]||new Set())];
        return genes.join('\n');
      }
      function logFact(n){
        let res=0;
        for(let i=2;i<=n;i++) res+=Math.log(i);
        return res;
      }
      function logChoose(n,k){
        if(k<0||k>n) return -Infinity;
        return logFact(n)-logFact(k)-logFact(n-k);
      }
      function hypergeomPval(N,K,n,k){
        let p=0;
        for(let i=k;i<=Math.min(K,n);i++){
          const term=Math.exp(logChoose(K,i)+logChoose(N-K,n-i)-logChoose(N,n));
          p+=term;
        }
        return p;
      }
      function calculateSignificance(){
        if(!state.lastCounts){
          significanceResults.textContent='Draw a Venn diagram first.';
          return;
        }
        const total=+totalGenesInput.value;
        if(!total||total<Math.max(state.lastCounts.nA,state.lastCounts.nB,state.lastCounts.nC)){
          significanceResults.textContent='Please enter a valid total gene count.';
          return;
        }
        const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
        const res=[];
        const pAB=hypergeomPval(total,state.lastCounts.nA,state.lastCounts.nB,state.lastCounts.AB+state.lastCounts.ABC);
        res.push({name:`${labels.A}∩${labels.B}`,p:pAB});
        if(state.lastCounts.nC>0){
          const pAC=hypergeomPval(total,state.lastCounts.nA,state.lastCounts.nC,state.lastCounts.AC+state.lastCounts.ABC);
          res.push({name:`${labels.A}∩${labels.C}`,p:pAC});
          const pBC=hypergeomPval(total,state.lastCounts.nB,state.lastCounts.nC,state.lastCounts.BC+state.lastCounts.ABC);
          res.push({name:`${labels.B}∩${labels.C}`,p:pBC});
          const pABC=hypergeomPval(total,state.lastCounts.AB+state.lastCounts.ABC,state.lastCounts.nC,state.lastCounts.ABC);
          res.push({name:`${labels.A}∩${labels.B}∩${labels.C}`,p:pABC});
        }
        significanceResults.innerHTML='<table><tr><th>Overlap</th><th>p-value</th><th>Significant</th></tr>'+
          res.map(r=>`<tr><td>${r.name}</td><td>${r.p.toExponential(2)}</td><td>${r.p<0.05?'yes':'no'}</td></tr>`).join('')+
          '</table>';
      }
      async function guessSpecies(genes){
        const counts={hsapiens:0,mmusculus:0,dmelanogaster:0,celegans:0};
        const taxMap={'9606':'hsapiens','10090':'mmusculus','7227':'dmelanogaster','6239':'celegans'};
        const sample=genes.slice(0,20);
        for(const g of sample){
          const url=`https://mygene.info/v3/query?q=${encodeURIComponent(g)}&fields=symbol,taxid&species=9606,10090,7227,6239&size=5`;
          try{
            const resp=await fetch(url);
            if(!resp.ok) continue;
            const data=await resp.json();
            const hit=data.hits?.find(h=>h.symbol===g) ||
                      data.hits?.find(h=>h.symbol?.toLowerCase()===g.toLowerCase()) ||
                      data.hits?.[0];
            const tax=hit?.taxid?.toString();
            const sp=taxMap[tax];
            if(sp) counts[sp]++;
          }catch(err){}
        }
        const total=Object.values(counts).reduce((a,b)=>a+b,0);
        if(total===0) return null;
        const [best,bestScore]=Object.entries(counts).reduce((m,e)=>e[1]>m[1]?e:m,['',0]);
        if(bestScore/total<0.6) return null;
        return best;
      }
      function getAllGenes(){
        const mode=inputs.delimiter.value, cs=inputs.caseSensitive.checked;
        const A=parseList(inputs.A.value,cs,mode).map(o=>o.val);
        const B=parseList(inputs.B.value,cs,mode).map(o=>o.val);
        const C=parseList(inputs.C.value,cs,mode).map(o=>o.val);
        const unique=[...new Set([...A,...B,...C])];
        return unique;
      }
      function setSpeciesIndicator(success){
        if(success===null){
          speciesSelect.style.backgroundColor='';
          return;
        }
        const color=success?'#b5d99c':'#f28b82';
        speciesSelect.style.backgroundColor=color;
      }
      async function recognizeSpeciesFromInput(){
        const genes=getAllGenes();
        const guess=genes.length?await guessSpecies(genes):null;
        if(guess){
          speciesSelect.value=guess;
          setSpeciesIndicator(true);
        }else{
          speciesSelect.value='';
          setSpeciesIndicator(false);
        }
      }
      function runGOAnalysis(genes, organism){
        const formatted=genes.map(g=>g.trim().toUpperCase()).filter(x=>x);
        if(!formatted.length){ goResults.innerHTML='<i>No genes for analysis</i>'; return; }
        const org=organism || speciesSelect.value;
        if(!org){
          goResults.innerHTML='<div>Please select a species before running GO analysis.</div>';
          return;
        }
        const sources=goCategoryChecks.filter(cb=>cb.checked).map(cb=>cb.value);
        if(!sources.length){
          goResults.innerHTML='<div>Please select at least one GO category.</div>';
          return;
        }
        lastGOFormatted=formatted;
        lastGOOrganism=org;
        lastGOResult=null;
        renderGOChart();
        goResults.innerHTML='<i>Running GO analysis...</i>';
        const body={organism:org,query:formatted,sources:sources};
        if(goUseAllBackground.checked){
          const bg=getAllGenes().map(g=>g.trim().toUpperCase()).filter(x=>x);
          if(bg.length){
            body.background=bg;
            body.domain_scope='custom';
          }
        }
        fetch('https://biit.cs.ut.ee/gprofiler/api/gost/profile/',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body)
        }).then(r=>{
          if(!r.ok) throw new Error('GO API HTTP '+r.status);
          return r.json();
        }).then(d=>{
          lastGOResult=(d.result||[]).filter(r=>sources.includes(r.source));
          if(lastGOResult.length){
            renderGOResults(5);
          }else{
            goResults.innerHTML='<div>No GO results</div>';
          }
        }).catch(err=>{
          goResults.innerHTML='<div>Error fetching GO analysis</div>';
        });
      }
      function runStringAnalysis(genes, organism){
        const formatted=genes.map(g=>g.trim().toUpperCase()).filter(x=>x);
        if(!formatted.length){ stringNetwork.innerHTML=''; stringResults.innerHTML='<i>No genes for analysis</i>'; stringNetworkExport.style.display='none'; return; }
        const org=organism || speciesSelect.value;
        if(!org){
          stringNetwork.innerHTML='';
          stringResults.innerHTML='<div>Please select a species before running STRING analysis.</div>';
          stringNetworkExport.style.display='none';
          return;
        }
        stringNetwork.innerHTML='<i>Loading STRING network...</i>';
        stringResults.innerHTML='<i>Running STRING enrichment...</i>';
        stringNetworkExport.style.display='none';
        const params=new URLSearchParams();
        const joinedIds=formatted.join('\n');
        params.set('identifiers', joinedIds);
        const stringMap={hsapiens:'9606',mmusculus:'10090',dmelanogaster:'7227',celegans:'6239'};
        const stringSpecies=stringMap[org]||speciesSelect.selectedOptions[0]?.dataset.string||'9606';
        params.set('species', stringSpecies);
        const networkType=document.querySelector('input[name="stringNetworkType"]:checked').value;
        const edgeMeaning=document.querySelector('input[name="stringEdgeMeaning"]:checked').value;
        const sources=[...document.querySelectorAll('.stringSource:checked')].map(el=>el.value);
        params.set('network_type', networkType);
        params.set('network_flavor', edgeMeaning);
        if(sources.length) params.set('sources', sources.join('%0d'));
        const networkUrl='https://string-db.org/api/svg/network?'+params.toString();
        fetch(networkUrl)
        .then(r=>{ if(!r.ok) throw new Error('STRING network HTTP '+r.status); return r.text(); })
        .then(svgText=>{
          state.lastStringSVG=svgText;
          const wrapper=document.createElement('div');
          wrapper.innerHTML=svgText;
          const svgEl=wrapper.querySelector('svg');
          stringNetwork.innerHTML='';
          if(svgEl){
            svgEl.style.maxWidth='150%';
            stringNetwork.appendChild(svgEl);
            stringNetworkExport.style.display='flex';
          }else{
            stringNetwork.innerHTML='<div>Failed to load STRING network</div>';
          }
        })
        .catch(err=>{
          stringNetwork.innerHTML='<div>Error loading STRING network</div>';
          stringNetworkExport.style.display='none';
        });
        fetch('https://string-db.org/api/json/enrichment?'+params.toString())
        .then(r=>{
          if(!r.ok) throw new Error('STRING API HTTP '+r.status);
          return r.json();
        }).then(d=>{
          if(Array.isArray(d)){
            const items=d.slice(0,5).map(r=>{
              const desc=r.termDescription||r.description||'unknown term';
              return '<div>'+desc+' (FDR='+Number(r.fdr).toExponential(2)+')</div>';
            }).join('');
            stringResults.innerHTML='<strong>STRING enrichment</strong>'+items;
          }else{
            stringResults.innerHTML='<div>No STRING results</div>';
          }
        }).catch(err=>{
          stringResults.innerHTML='<div>Error fetching STRING analysis</div>';
        });
      }
      function refreshCounts(c){
        countsUI.A.textContent=c.nA;
        countsUI.B.textContent=c.nB;
        countsUI.C.textContent=c.nC;
        countsUI.AB.textContent=c.AB+c.ABC;
        countsUI.AC.textContent=c.AC+c.ABC;
        countsUI.BC.textContent=c.BC+c.ABC;
        countsUI.ABC.textContent=c.ABC;
      }
      function updateCountLabels(labels){
        $('#labelAName').textContent=labels.A;
        $('#labelBName').textContent=labels.B;
        $('#labelCName').textContent=labels.C;
        $('#labelABName').textContent=labels.A+'∩'+labels.B;
        $('#labelACName').textContent=labels.A+'∩'+labels.C;
        $('#labelBCName').textContent=labels.B+'∩'+labels.C;
        $('#labelABCName').textContent=labels.A+'∩'+labels.B+'∩'+labels.C;
      }
      function updateRegionSelect(labels){
        const map={
          A:labels.A+' only',
          B:labels.B+' only',
          C:labels.C+' only',
          AB:labels.A+'∩'+labels.B+' only',
          AC:labels.A+'∩'+labels.C+' only',
          BC:labels.B+'∩'+labels.C+' only',
          ABC:labels.A+'∩'+labels.B+'∩'+labels.C
        };
        [...regionSelect.options].forEach(o=>{ if(map[o.value]) o.textContent=map[o.value]; });
      }
      function updateColorLabels(labels){
        $('#colorLabelA').textContent=labels.A;
        $('#colorLabelB').textContent=labels.B;
        $('#colorLabelC').textContent=labels.C;
      }
      function drawFromLists(){
        const mode=inputs.delimiter.value, cs=inputs.caseSensitive.checked;
        const A=parseList(inputs.A.value,cs,mode), B=parseList(inputs.B.value,cs,mode), C=parseList(inputs.C.value,cs,mode);
        const regions=setsFromLists(A,B,C); state.lastRegions=regions; state.lastDrawMode='lists';
        const counts={nA:regions.A.size,nB:regions.B.size,nC:regions.C.size,Aonly:regions.Aonly.size,Bonly:regions.Bonly.size,Conly:regions.Conly.size,AB:regions.AB.size,AC:regions.AC.size,BC:regions.BC.size,ABC:regions.ABC.size};
        state.lastCounts=counts;
        significanceResults.innerHTML='';
        refreshCounts(counts);
        const pairs={nAB:counts.AB+counts.ABC,nAC:counts.AC+counts.ABC,nBC:counts.BC+counts.ABC};
        const L=layoutFromCounts(counts.nA,counts.nB,counts.nC,pairs.nAB,pairs.nAC,pairs.nBC);
        const style={colorA:inputs.colorA.value,colorB:inputs.colorB.value,colorC:inputs.colorC.value,opacity:inputs.opacity.value,fontsize:inputs.fontsize.value,borderColor:inputs.borderColor.value,borderWidth:inputs.borderWidth.value};
        const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
        updateCountLabels(labels); updateRegionSelect(labels); updateColorLabels(labels);
        fitAndDraw(L,style,labels,counts);
        populateRegion(regionSelect.value);
        recognizeSpeciesFromInput().catch(err=>{});
        console.log('drawFromLists complete with enhanced styles');
      }
      function drawFromNumeric(){
        const nA=+inputs.counts.nA.value||0, nB=+inputs.counts.nB.value||0, nC=+inputs.counts.nC.value||0;
        const nAB=+inputs.counts.nAB.value||0, nAC=+inputs.counts.nAC.value||0, nBC=+inputs.counts.nBC.value||0, nABC=+inputs.counts.nABC.value||0;
        const Aonly=Math.max(0,nA-(nAB+nAC-nABC)), Bonly=Math.max(0,nB-(nAB+nBC-nABC)), Conly=Math.max(0,nC-(nAC+nBC-nABC));
        const counts={nA,nB,nC,Aonly,Bonly,Conly,AB:Math.max(0,nAB-nABC),AC:Math.max(0,nAC-nABC),BC:Math.max(0,nBC-nABC),ABC:nABC};
        state.lastRegions={A:new Set(),B:new Set(),C:new Set(),Aonly:new Set(),Bonly:new Set(),Conly:new Set(),AB:new Set(),AC:new Set(),BC:new Set(),ABC:new Set()}; state.lastDrawMode='numeric';
        state.lastCounts=counts;
        significanceResults.innerHTML='';
        refreshCounts(counts);
        const L=layoutFromCounts(nA,nB,nC,nAB,nAC,nBC);
        const style={colorA:inputs.colorA.value,colorB:inputs.colorB.value,colorC:inputs.colorC.value,opacity:inputs.opacity.value,fontsize:inputs.fontsize.value,borderColor:inputs.borderColor.value,borderWidth:inputs.borderWidth.value};
        const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
        updateCountLabels(labels); updateRegionSelect(labels); updateColorLabels(labels);
        fitAndDraw(L,style,labels,counts);
        populateRegion(regionSelect.value);
        console.log('drawFromNumeric complete with enhanced styles');
      }
      
    document.getElementById('draw').addEventListener('click',drawFromLists);
        document.getElementById('useNumeric').addEventListener('click',drawFromNumeric);
        document.getElementById('exportSVG').addEventListener('click',exportSVG);
        document.getElementById('exportPNG').addEventListener('click',exportPNG);
        document.getElementById('openVenn').addEventListener('click',openVennFile);
        document.getElementById('saveVenn').addEventListener('click',saveVennFile);
        document.getElementById('saveAsVenn').addEventListener('click',saveAsVennFile);
        document.getElementById('vennGraphFile').addEventListener('change',e=>{
          const f=e.target.files[0];
          if(f){
            vennFileName=f.name;
            vennFileHandle=null;
            loadVennGraphFile(f);
          }
        });
        document.getElementById('goChartPNG').addEventListener('click',()=>{ exportGoChart('png');});
        document.getElementById('goChartSVG').addEventListener('click',()=>{ exportGoChart('svg');});
        document.getElementById('stringPNG').addEventListener('click',()=>{ downloadStringPNG();});
        document.getElementById('stringSVG').addEventListener('click',()=>{ downloadStringSVG();});
        calcSignificanceBtn.addEventListener('click',calculateSignificance);
        document.getElementById('sample').addEventListener('click',()=>{
          inputs.labelA.value='Transcriptomic'; inputs.labelB.value='Proteomic'; inputs.labelC.value='Phospho';
          inputs.A.value=`BRCA1
    ATM
    BAP1
    EZH2
    SUZ12
    RING1B`;
          inputs.B.value=`BRCA1
    BAP1
    RING1B
    CBX2
    HDAC1
    PAXIP1
    HUWE1`;
          inputs.C.value=`BRCA1
    PAXIP1
    CSNK2A1
    RING1B
    KAT7`;
          drawFromLists();
        });
        document.getElementById('reset').addEventListener('click',()=>{
          inputs.A.value=''; inputs.B.value=''; inputs.C.value='';
          Object.values(inputs.counts).forEach(x=>x.value=0);
          clearSVG(); state.lastRegions=null; state.lastDrawMode=null; state.lastCounts=null; regionList.textContent='';
          Object.values({A:1,B:1,C:1,AB:1,AC:1,BC:1,ABC:1}).forEach((_,i)=>{});
          document.getElementById('countA').textContent='0';
          document.getElementById('countB').textContent='0';
          document.getElementById('countC').textContent='0';
          document.getElementById('countAB').textContent='0';
          document.getElementById('countAC').textContent='0';
          document.getElementById('countBC').textContent='0';
          document.getElementById('countABC').textContent='0';
          updateCountLabels({A:'A',B:'B',C:'C'});
          updateColorLabels({A:'A',B:'B',C:'C'});
          updateRegionSelect({A:'A',B:'B',C:'C'});
          clearAnalysis();
          speciesSelect.value='';
          setSpeciesIndicator(null);
          totalGenesInput.value='';
          significanceResults.innerHTML='';
        });
        goBtn.addEventListener('click',async()=>{
          const regionGenes=getRegionText(regionSelect.value).split(/\n/).map(g=>g.trim()).filter(x=>x);
          let organism=speciesSelect.value;
          if(!organism){
            const allGenes=getAllGenes();
            const guess=allGenes.length?await guessSpecies(allGenes):null;
            if(guess){
              speciesSelect.value=organism=guess;
              setSpeciesIndicator(true);
            }else{
              setSpeciesIndicator(false);
              alert('Please select a species before running GO analysis.');
              return;
            }
          }
          runGOAnalysis(regionGenes, organism);
        });
        stringBtn.addEventListener('click',async()=>{
          const regionGenes=getRegionText(regionSelect.value).split(/\n/).map(g=>g.trim()).filter(x=>x);
          let organism=speciesSelect.value;
          if(!organism){
            const allGenes=getAllGenes();
            const guess=allGenes.length?await guessSpecies(allGenes):null;
            if(guess){
              speciesSelect.value=organism=guess;
              setSpeciesIndicator(true);
            }else{
              setSpeciesIndicator(false);
              alert('Please select a species before running STRING analysis.');
              return;
            }
          }
          runStringAnalysis(regionGenes, organism);
        });
    refreshDiagramFn = refreshDiagram;
    state.scheduleDraw = (Shared && typeof Shared.debounceFrame === 'function') ? Shared.debounceFrame(refreshDiagram) : refreshDiagram;

    venn.save = saveVennFile;
    venn.saveAs = saveAsVennFile;
    venn.open = openVennFile;
    venn.loadFromFile = loadVennGraphFile;
    venn.exportGoChart = exportGoChart;
    venn.downloadStringPNG = downloadStringPNG;
    venn.downloadStringSVG = downloadStringSVG;
    venn.calculateSignificance = calculateSignificance;
    venn.getRegionText = getRegionText;
    venn.getAllGenes = getAllGenes;
    venn.guessSpecies = guessSpecies;
    venn.runGOAnalysis = runGOAnalysis;
    venn.runStringAnalysis = runStringAnalysis;
    venn.layoutFromCounts = layoutFromCounts;
    venn.fitAndDraw = fitAndDraw;
    venn.refreshCounts = refreshCounts;
    venn.updateCountLabels = updateCountLabels;
    venn.updateRegionSelect = updateRegionSelect;
    venn.updateColorLabels = updateColorLabels;
    venn.setSpeciesIndicator = setSpeciesIndicator;
    venn.recognizeSpeciesFromInput = recognizeSpeciesFromInput;
    venn.clearAnalysis = clearAnalysis;
    venn.drawFromLists = drawFromLists;
    venn.drawFromNumeric = drawFromNumeric;

    venn.ready = true;
    console.debug('Debug: Components.venn.init complete');
  };

  venn.draw = function draw(){
    if(!venn.ready){ venn.init(); }
    try{
      if(state.scheduleDraw){ state.scheduleDraw(); } else if(refreshDiagramFn){ refreshDiagramFn(); }
    }catch(err){ console.error('venn.draw error', err); }
  };

  venn.ensure = function ensure(){ if(!venn.ready){ venn.init(); } };

})(window);
