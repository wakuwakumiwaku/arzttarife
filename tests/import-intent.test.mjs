import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
