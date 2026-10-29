import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import * as domain from '../src/domain.js';
import {realm,root,source,reference} from './helpers/import-platform.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
// The two original QUALITY business-case bodies below are retained byte-for-byte.
test('positive: ordinary current import preview, cancel and accepted unsaved replacement preserve stored before-image',async()=>{
 const r=await realm();await r.setfile(Promise.resolve(JSON.stringify(r.valid('111'))),'current.json');
 assert.equal(r.state().pending.value.calculators.tardoc.al,'111');assert.equal(r.get('import-dialog').open,true);
 await r.get('cancel-import').click();assert.equal(r.get('import-dialog').open,false);assert.equal(r.state().draft.calculators.tardoc.al,'10.56');
 await r.setfile(Promise.resolve(JSON.stringify(r.valid('222'))),'current2.json');await r.get('confirm-import').click();
 assert.equal(r.state().draft.calculators.tardoc.al,'222');assert.equal(r.map.get(domain.STORAGE_KEY),r.raw);assert.deepEqual(r.writes,[]);
 console.log(JSON.stringify({control:'current file -> preview/cancel/confirm',appSha256:hash(source),domainSha256:hash(await readFile(new URL('src/domain.js',root))),draft:r.state().draft,rawBefore:r.raw,rawAfter:r.map.get(domain.STORAGE_KEY),writes:r.writes}));
});
test('latest saved-workspace recovery intent must supersede an earlier held file read',async()=>{
 const r=await realm();let release;const held=new Promise(resolve=>{release=resolve;});
 const oldRead=r.setfile(held,'old-held.json');
 // File.text was synchronously reached and is pending; use actual saved-recovery registered caller next.
 assert.equal(r.state().epoch,1);assert.equal(r.state().pending,null);
 await r.get('reload-workspace').click();
 const before=r.state();assert.equal(before.pending.kind,'workspace');assert.equal(before.pending.value.calculators.tardoc.al,'10.56');
 assert.equal(r.get('import-dialog').open,true);assert.equal(r.map.get(domain.STORAGE_KEY),r.raw);
 release(JSON.stringify(r.valid('777')));await oldRead;
 const after=r.state();
 // Observe full actual confirm path too; it must not adopt the older file as the saved recovery.
 await r.get('confirm-import').click();const confirmed=r.state();
 console.log(JSON.stringify({scenario:'held native-boundary file read -> actual saved reload preview -> release old read -> actual confirm',appSha256:hash(source),before,after,confirmed,rawBefore:r.raw,rawAfter:r.map.get(domain.STORAGE_KEY),writes:r.writes,modeledPlatform:['DOM','same-origin startup fetch','localStorage Map','controlled File.text promise'],browserExecuted:false}));
 assert.equal(after.pending.value.calculators.tardoc.al,'10.56','stale older file replaced the newer saved-workspace recovery preview');
 assert.equal(confirmed.draft.calculators.tardoc.al,'10.56');
 assert.equal(r.map.get(domain.STORAGE_KEY),r.raw);assert.deepEqual(r.writes,[]);
});
const savedPreview=r=>{
 const s=r.snapshot();assert.equal(s.open,true);assert.equal(s.state.pending.kind,'workspace');
 assert.equal(s.state.pending.value.calculators.tardoc.al,'10.56');assert.equal(s.title,'Arbeitsstand · Importvorschau');
 assert.match(s.body,/al: 10\.56 · ipl: 8\.64 · tpw: 0\.91 · quantity: 1/);assert.doesNotMatch(s.body,/777/);return s;
};
const end=async(r,action)=>{
 if(action==='confirm')await r.get('confirm-import').click();
 if(action==='cancel')await r.get('cancel-import').click();
 if(action==='escape')await r.get('import-dialog').emit('cancel');
};
for(const result of ['success','invalid','reject'])for(const action of ['preview','cancel','escape','confirm'])test(`saved recovery owns ${result} after ${action}: preview provenance, status, dirty draft and raw`,async()=>{
 const expectedAL=action==='confirm'?'10.56':'123.45'; // Independent preaction oracle.
 const r=await realm();await r.edit();const held=r.held();await held.started;
 assert.equal(r.trace[0][0],'File.text');await r.get('reload-workspace').click();savedPreview(r);
 assert.equal(r.state().draft.calculators.tardoc.al,'123.45');await end(r,action);const before=r.snapshot();
 if(result==='reject')held.reject(Error('QA obsolete read rejection'));else held.release(result==='success'?JSON.stringify(r.valid('777')):'{invalid');
 await held.completion;assert.deepEqual(r.trace.at(-1),['handler settled',held.name]);
 const after=r.snapshot();assert.deepEqual(after,before);assert.equal(after.state.draft.calculators.tardoc.al,expectedAL);r.intact();
 if(action==='preview'){savedPreview(r);await end(r,'confirm');assert.equal(r.state().draft.calculators.tardoc.al,'10.56');r.intact();}
});
test('standalone saved restore/cancel/confirm remains nonmutating until explicit save',async()=>{
 const r=await realm();await r.edit();await r.get('reload-workspace').click();savedPreview(r);await end(r,'cancel');
 assert.equal(r.state().draft.calculators.tardoc.al,'123.45');r.intact();
 await r.get('reload-workspace').click();savedPreview(r);await end(r,'confirm');assert.equal(r.state().draft.calculators.tardoc.al,'10.56');r.intact();
 await r.get('save').click();assert.equal(r.writes.length,1);assert.equal(r.writes[0][0],domain.STORAGE_KEY);assert.deepEqual(JSON.parse(r.writes[0][1]),JSON.parse(r.raw));assert.equal(r.writes[0][1],JSON.stringify(JSON.parse(r.raw)));
 assert.equal(r.state().blocked,false);assert.equal(r.state().dirty,false);
});
for(const fault of ['corrupt','read'])for(const result of ['success','reject'])test(`failed saved recovery ${fault} invalidates older ${result} without losing draft/raw/status`,async()=>{
 const r=await realm();await r.edit();await r.file(r.valid('222'));const held=r.held();await held.started;
 if(fault==='corrupt')r.map.set(domain.STORAGE_KEY,'  {broken raw  ');else r.setReadFault(true);
 const beforeRaw=r.map.get(domain.STORAGE_KEY);await r.get('reload-workspace').click();const before=r.snapshot();
 assert.equal(before.state.pending,null);assert.equal(before.open,false);assert.match(before.notice,/beschädigt oder gesperrt/);
 assert.equal(before.state.draft.calculators.tardoc.al,'123.45');
 if(result==='success')held.release(JSON.stringify(r.valid('777')));else held.reject(Error('QA obsolete read'));
 await held.completion;assert.deepEqual(r.snapshot(),before);assert.equal(r.map.get(domain.STORAGE_KEY),beforeRaw);assert.deepEqual(r.writes,[]);
});
test('a genuinely newer file can replace saved intent; current invalid selection never mutates saved preview or draft',async()=>{
 const r=await realm();await r.edit();await r.get('reload-workspace').click();const s=savedPreview(r);
 await r.file('{bad');assert.equal(r.get('import-body').textContent,s.body);assert.equal(r.state().pending.value.calculators.tardoc.al,'10.56');assert.match(r.get('notice').textContent,/Nicht geöffnet:/);assert.equal(r.state().draft.calculators.tardoc.al,'123.45');
 await r.file(r.valid('222'));assert.match(r.get('import-body').textContent,/al: 222/);await end(r,'confirm');assert.equal(r.state().draft.calculators.tardoc.al,'222');r.intact();
});
test('current reader failures, size gate and missing file retain draft/raw and report only current failure',async()=>{
 const r=await realm();await r.edit();let called=false;
 await r.choose(()=>{called=true;throw Error('not reached');},'large.json','workspace',40001);assert.equal(called,false);assert.match(r.get('notice').textContent,/Datei zu gross/);
 await r.choose(()=>Promise.reject(Error('current read denied')));assert.match(r.get('notice').textContent,/current read denied/);
 await r.file('{bad');assert.match(r.get('notice').textContent,/Nicht geöffnet:/);
 r.get('workspace-file').files=[];await r.get('workspace-file').emit('change');assert.equal(r.state().draft.calculators.tardoc.al,'123.45');r.intact();
});
test('cross-tab block and saved preview do not discard dirty draft or bypass save guard',async()=>{
 const r=await realm();await r.edit();const foreignRaw=' \n'+JSON.stringify(r.valid('333'))+'  ';
 await r.foreignChange(foreignRaw);assert.equal(r.state().blocked,true);await r.get('reload-workspace').click();assert.match(r.get('import-body').textContent,/al: 333/);
 await end(r,'cancel');assert.equal(r.state().draft.calculators.tardoc.al,'123.45');await r.get('save').click();assert.deepEqual(r.writes,[]);assert.equal(r.map.get(domain.STORAGE_KEY),foreignRaw);
});
test('unload invalidates a held workspace handler and leaves its draft intact',async()=>{
 const r=await realm();await r.edit();const h=r.held();await h.started;await r.get('unload-catalog').click();const before=r.snapshot();h.release(JSON.stringify(r.valid('777')));await h.completion;assert.deepEqual(r.snapshot(),before);r.intact();
});
let catalogText;
try{catalogText=await readFile(new URL('.local/catalog.json',root),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
for(const phase of ['text','hash','hash-reject'])test(`real private catalog ${phase}: saved recovery supersedes actual catalog producer`,{skip:catalogText?false:'Private catalog absent; real catalog producer not executed'},async()=>{
 const r=await realm();await r.edit();let completion,release;
 if(phase==='text'){const h=r.held('catalog');await h.started;completion=h.completion;release=()=>h.release(catalogText);}
 else{
  const gate=r.holdDigest();completion=r.file(catalogText,'catalog');await gate.started.promise;await gate.native.promise; // Real WebCrypto acknowledgement, not a microturn oracle.
  release=()=>phase==='hash-reject'?gate.delivery.reject(Error('QA obsolete hash delivery')):gate.delivery.resolve();
 }
 const rAfter=()=>{const after=r.snapshot();assert.equal(after.state.pending?.kind,'workspace','saved recovery must retain workspace preview before full snapshot equality');assert.deepEqual(after,before);};
 await r.get('reload-workspace').click();savedPreview(r);const before=r.snapshot();release();await completion;rAfter();
 await end(r,'confirm');assert.equal(r.state().draft.calculators.tardoc.al,'10.56');assert.equal(r.state().catalog,null);r.intact();
});
test('real private catalog current preview/cancel/confirm/unload is RAM-only', {skip:catalogText?false:'Private catalog absent; current catalog control not executed'},async()=>{
 const r=await realm();await r.file(catalogText,'catalog');assert.equal(r.state().pending.kind,'catalog');await end(r,'cancel');assert.equal(r.state().catalog,null);
 await r.file(catalogText,'catalog');await end(r,'confirm');assert.deepEqual(r.state().catalog,{positions:1702,contexts:9});r.intact();await r.get('unload-catalog').click();assert.equal(r.state().catalog,null);r.intact();
});

// Search/render fixtures below are explicitly SYNTHETIC, not official tariffs.
// RAM workload injection exercises the production activation/render callers only;
// it is NOT an import and claims no catalogue admission. The real size/hash/schema
// gate, profile and WebCrypto are never replaced; a separate refusal control follows.
function syntheticRenderCatalog(marker='oldmarker'){
 const positions=Array.from({length:67},(_,i)=>['tardoc','pauschalen'].map(mode=>({
  id:`SYNTHETIC-${mode}-${i}`,mode,code:`SYNTHETIC-${66-i}`,
  title:`SYNTHETIC alpha beta gamma ${i}`,chapter:i%2?'SYNTHETIC odd':'SYNTHETIC even',
  interpretation:`SYNTHETIC notes ${marker}; not official tariff data`,
  amounts:mode==='tardoc'?{al:{kind:'numeric',decimal:'0.00',raw:'SYNTHETIC'},ipl:{kind:'missing',raw:''}}:{points:{kind:'missing',raw:''}},
  fields:[{name:'SYNTHETIC',text:'SYNTHETIC detail field'}],source:{id:mode,sheet:'SYNTHETIC',row:i+1}
 }))).flat();
 const contexts=['tardoc','pauschalen'].map(mode=>({id:`SYNTHETIC-${mode}`,mode,sheet:'SYNTHETIC context',rows:Array.from({length:67},(_,i)=>({row:i+1,cells:{A:`SYNTHETIC alpha beta gamma ${i}`,B:`SYNTHETIC notes ${marker}`}}))}));
 return {positions,contexts};
}
function activateRenderFixture(r,c=syntheticRenderCatalog()){
 r.context.SYNTHETIC_RENDER_WORKLOAD=c;
 vm.runInContext('activateCatalog(SYNTHETIC_RENDER_WORKLOAD);delete globalThis.SYNTHETIC_RENDER_WORKLOAD;',r.context);
 return c;
}
const resultRows=r=>r.get('results').children.filter(n=>n.tagName==='ARTICLE');
const filteredRows=r=>vm.runInContext('filtered',r.context);
const idsOf=rows=>Array.from(rows,x=>x.id);
const assertCards=(r,rows)=>assert.deepEqual(resultRows(r).map(n=>n.dataset.id),idsOf(rows));
async function search(r,query){r.get('search').value=query;await r.get('search').emit('input');}
async function view(r,value){r.get('view').value=value;await r.get('view').emit('change');}
function observeSearch(r){
 vm.runInContext(`globalThis.searchNormalizations=[];globalThis.nativeNormalize=String.prototype.normalize;
  String.prototype.normalize=function(...args){searchNormalizations.push(String(this));return nativeNormalize.apply(this,args);};`,r.context);
 return ()=>r.context.searchNormalizations.length;
}
function observeArticles(r){
 let articles=0;const create=r.context.document.createElement;
 r.context.document.createElement=tag=>{if(tag==='article')articles++;return create(tag);};
 return ()=>articles;
}
test('search normalizes each cheap-filter survivor once, preserving full projection, AND, order and object references',async()=>{
 const r=await realm(),calls=observeSearch(r);
 const rows=[
  {id:'SYNTHETIC-IDTOKEN',mode:'both',category:'A',title:'Économie Straße alpha beta gamma'},
  {id:'SYNTHETIC-code',mode:'tardoc',chapter:'B',code:'ZX.91.0078',title:'alpha beta'},
  {id:'SYNTHETIC-summary',mode:'pauschalen',category:'A',summary:'summaryonly alpha beta gamma'},
  {id:'SYNTHETIC-detail',mode:'both',category:'B',detail:'detailonly alpha beta gamma'},
  {id:'SYNTHETIC-notes',mode:'tardoc',chapter:'A',interpretation:'interpretationonly alpha beta gamma'},
  {id:'SYNTHETIC-fields',mode:'pauschalen',chapter:'B',fields:[{name:'nameonly',text:'fieldonly alpha beta gamma'}]},
  {id:'SYNTHETIC-empty',mode:'both',category:'A'}
 ];
 const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');
 const queries=['','  \t\n ','alpha',' alpha\t beta\n gamma ','absent alpha','alpha beta absent','ÉCONOMIE STRASSE','ZX.91.0078','IDTOKEN','summaryonly','detailonly','interpretationonly','fieldonly','nameonly'];
 for(const mode of ['tardoc','pauschalen'])for(const category of ['','A','B','absent'])for(const favoritesOnly of [false,true])for(const query of queries){
  const favorites=['SYNTHETIC-IDTOKEN','SYNTHETIC-notes','SYNTHETIC-fields'],o={mode,category,favoritesOnly,favorites,query};
  const survivors=rows.filter(x=>(x.mode===mode||x.mode==='both')&&(!category||(x.category||x.chapter)===category)&&(!favoritesOnly||favorites.includes(x.id)));
  const words=norm(query).trim().split(/\s+/).filter(Boolean);
  // Compatibility oracle retains the original searchable projection, not production filtering.
  const expected=survivors.filter(x=>words.every(w=>norm([x.id,x.code,x.title,x.summary,x.detail,x.interpretation,...(x.fields||[]).map(f=>f.text)].filter(Boolean).join(' ')).includes(w)));
  const before=calls(),actual=r.domain.filterRecords(rows,o);
  assert.deepEqual(idsOf(actual),idsOf(expected),JSON.stringify(o));
  actual.forEach((x,i)=>assert.equal(x,expected[i],'filter must return original objects in source order'));
  assert.equal(calls()-before,1+(words.length?survivors.length:0),`one query normalization, no empty-query projections, at most one per survivor: ${JSON.stringify(o)}`);
 }
 r.intact();
});
test('More appends only next 30 and final partial page without searching, replacing cards or losing first-new-button focus',async()=>{
 const r=await realm(),articles=observeArticles(r),calls=observeSearch(r),c=activateRenderFixture(r);
 await search(r,'alpha beta gamma');
 const expected=c.positions.filter(x=>x.mode==='tardoc'),generation=filteredRows(r),first=[...resultRows(r)];
 assertCards(r,expected.slice(0,30));expected.forEach((x,i)=>assert.equal(generation[i],x));
 let beforeArticles=articles(),beforeCalls=calls();await r.get('more').click();
 assert.equal(articles()-beforeArticles,30,'More must create only the next page, never the old prefix');
 assert.equal(calls(),beforeCalls,'More must not run a fresh search');assert.equal(filteredRows(r),generation);
 first.forEach((card,i)=>assert.equal(resultRows(r)[i],card));assertCards(r,expected.slice(0,60));
 assert.equal(r.context.document.activeElement,resultRows(r)[30].querySelector('button'));
 const prefix=[...resultRows(r)];beforeArticles=articles();beforeCalls=calls();await r.get('more').click();
 assert.equal(articles()-beforeArticles,7);assert.equal(calls(),beforeCalls);assert.equal(filteredRows(r),generation);
 prefix.forEach((card,i)=>assert.equal(resultRows(r)[i],card));assertCards(r,expected);
 assert.equal(new Set(resultRows(r).map(n=>n.dataset.id)).size,67);assert.equal(r.get('more').hidden,true);
 assert.equal(r.get('count').textContent,'67 Treffer · 67 angezeigt');
 assert.equal(r.context.document.activeElement,resultRows(r)[60].querySelector('button'));r.intact();
});
test('query, reset, category, mode and view callers replace generations and restart at 30',async()=>{
 const r=await realm(),calls=observeSearch(r),c=activateRenderFixture(r);
 const fresh=async(action,expected)=>{
  await r.get('more').click();const old=filteredRows(r),first=resultRows(r)[0],before=calls();
  await action();assert.notEqual(filteredRows(r),old);assert(calls()>before,'non-More must search anew');
  assert.notEqual(resultRows(r)[0],first);assertCards(r,expected.slice(0,30));assert.equal(vm.runInContext('visible',r.context),30);
  expected.forEach((x,i)=>assert.equal(filteredRows(r)[i],x));
 };
 const tardoc=c.positions.filter(x=>x.mode==='tardoc'),pauschalen=c.positions.filter(x=>x.mode==='pauschalen');
 await fresh(()=>search(r,'alpha beta'),tardoc);
 await fresh(()=>r.get('reset').click(),tardoc);assert.equal(r.context.document.activeElement,r.get('search'));
 await fresh(async()=>{r.get('category').value='SYNTHETIC even';await r.get('category').emit('change');},tardoc.filter(x=>x.chapter==='SYNTHETIC even'));
 await fresh(()=>r.get('mode-pauschalen').click(),pauschalen);
 const contexts=vm.runInContext("contextRecords.filter(x=>x.mode==='pauschalen')",r.context);
 await fresh(()=>view(r,'contexts'),Array.from(contexts));
 await fresh(()=>view(r,'positions'),pauschalen);
 await search(r,'no-such-SYNTHETIC-row');assert.equal(resultRows(r).length,0);assert.equal(r.get('more').hidden,true);
 await r.get('reset').click();assertCards(r,pauschalen.slice(0,30));
 await view(r,'reference');assertCards(r,reference.entries.filter(x=>x.mode==='both'||x.mode==='pauschalen'));
 await view(r,'positions');assertCards(r,pauschalen.slice(0,30));r.intact();
});
test('activation, same-ID notes-only replacement and unload never retain old result objects or detail handlers',async()=>{
 const r=await realm(),a=activateRenderFixture(r);await search(r,'oldmarker');await r.get('more').click();
 const oldGeneration=filteredRows(r),oldFirst=resultRows(r)[0],b=structuredClone(a);
 b.positions.forEach(x=>{x.interpretation=x.interpretation.replace('oldmarker','newmarker');});
 b.contexts.forEach(t=>t.rows.forEach(x=>{x.cells.B=x.cells.B.replace('oldmarker','newmarker');}));
 activateRenderFixture(r,b);const expected=b.positions.filter(x=>x.mode==='tardoc');
 assert.notEqual(filteredRows(r),oldGeneration);assert.notEqual(resultRows(r)[0],oldFirst);assertCards(r,expected.slice(0,30));
 expected.forEach((x,i)=>assert.equal(filteredRows(r)[i],x));
 await resultRows(r)[0].querySelector('button').click();assert.match(r.get('detail-body').textContent,/newmarker/);assert.doesNotMatch(r.get('detail-body').textContent,/oldmarker/);await r.get('close-detail').click();
 await search(r,'oldmarker');assert.equal(resultRows(r).length,0);
 await search(r,'newmarker');assertCards(r,expected.slice(0,30));await r.get('more').click();assertCards(r,expected.slice(0,60));
 await view(r,'contexts');await search(r,'oldmarker');assert.equal(resultRows(r).length,0);await search(r,'newmarker');assert.equal(resultRows(r).length,30);
 await r.get('unload-catalog').click();assert.equal(r.state().catalog,null);assert.equal(r.get('view').value,'reference');
 assert(!Array.from(filteredRows(r)).some(x=>b.positions.includes(x)));assert.equal(resultRows(r).length,0); // Active query remains unchanged.
 await view(r,'positions');assert.equal(resultRows(r).length,0);assert.equal(filteredRows(r).length,0);assert.equal(r.get('more').hidden,true);assert.match(r.get('results').textContent,/Vollständige Originale/);
 await view(r,'contexts');assert.equal(filteredRows(r).length,0);
 activateRenderFixture(r,a);assertCards(r,a.positions.filter(x=>x.mode==='tardoc').slice(0,30));r.intact();
});
test('favorite toggles and real workspace import/recovery invalidate results without implicit storage writes',async()=>{
 const r=await realm();activateRenderFixture(r);await r.get('more').click();await view(r,'reference');
 const first=resultRows(r)[0],id=first.dataset.id,old=filteredRows(r);
 // Preserve the existing favorite-toggle prefix exception, while still searching anew.
 vm.runInContext('visible=60',r.context);await first.children.at(-1).children.at(-1).click();
 assert.notEqual(filteredRows(r),old);assert.notEqual(resultRows(r)[0],first);assert.equal(vm.runInContext('visible',r.context),60);assert(r.state().draft.favorites.includes(id));
 r.get('favorites-only').checked=true;await r.get('favorites-only').emit('change');assert.deepEqual(resultRows(r).map(x=>x.dataset.id),[id]);
 await resultRows(r)[0].children.at(-1).children.at(-1).click();assert.equal(resultRows(r).length,0);
 const imported=r.valid('222');imported.favorites=['rights'];const before=filteredRows(r);
 await r.file(imported);assert.equal(r.state().pending.kind,'workspace');assert.equal(filteredRows(r),before,'preview must not mutate current results');
 await r.get('confirm-import').click();assert.notEqual(filteredRows(r),before);assert.deepEqual(resultRows(r).map(x=>x.dataset.id),['rights']);assert.equal(vm.runInContext('visible',r.context),30);r.intact();
 const current=filteredRows(r);await r.get('reload-workspace').click();assert.equal(filteredRows(r),current);await r.get('confirm-import').click();assert.notEqual(filteredRows(r),current);assert.equal(resultRows(r).length,0);r.intact();
});
test('synthetic render workloads cannot pass the real native catalogue size/hash admission gate',async()=>{
 const r=await realm();await r.file(JSON.stringify(syntheticRenderCatalog()),'catalog');
 assert.match(r.get('catalog-status').textContent,/Dateigrösse/);assert.equal(r.state().pending,null);assert.equal(r.state().catalog,null);
 const profile=JSON.parse(await readFile(new URL('public/data/local-profile.json',root),'utf8'));
 await r.file('SYNTHETIC invalid catalogue; not official tariff data'.padEnd(profile.bytes,' '),'catalog');
 assert.match(r.get('catalog-status').textContent,/SHA256/);assert.equal(r.state().pending,null);assert.equal(r.state().catalog,null);assert.equal(r.get('import-dialog').open,false);r.intact();
});
