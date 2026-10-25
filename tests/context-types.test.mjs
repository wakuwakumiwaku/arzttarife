import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Optional binding permits the identical regression bytes to exercise an immutable predecessor.
const domainURL=process.env.TARIFF_DOMAIN_MODULE?pathToFileURL(resolve(process.env.TARIFF_DOMAIN_MODULE)):new URL('../src/domain.js',import.meta.url);
const {calculate,verifyCatalogText,validateLocalCatalog}=await import(domainURL.href);
const profile=JSON.parse(await readFile(new URL('../public/data/local-profile.json',import.meta.url),'utf8'));
const modes=mode=>[
 ['array',[mode]],['nested array',[[mode]]],['plain object',{}],['boxed string object',Object(mode)]
];
const fields={al:'10.56',ipl:'8.64',points:'7537.84',tpw:'0.91',quantity:'1'};

for(const mode of ['tardoc','pauschalen']){
 test(`calculate accepts primitive ${mode}`,()=>assert.equal(calculate(mode,fields).cents,mode==='tardoc'?1747n:685943n));
 for(const [label,bad] of modes(mode))test(`calculate rejects ${label} ${mode} before field selection`,()=>{
  assert.throws(()=>calculate(bad,fields),/Unbekannter Tarifmodus\./);
 });
}

let catalog;
try{
 const file=process.env.LOCAL_CATALOG_FILE?resolve(process.env.LOCAL_CATALOG_FILE):new URL('../.local/catalog.json',import.meta.url);
 catalog=await verifyCatalogText(await readFile(file,'utf8'),profile);
}catch(e){if(e.code!=='ENOENT')throw e;}

for(const [label,bad] of modes('pauschalen')){
 test(`local position rejects ${label} mode at the tariff-mode boundary`,{skip:catalog?false:'Private catalog absent; real-row mode validation not executed'},()=>{
  const changed=structuredClone(catalog),position=changed.positions.find(p=>p.code==='C00.10A');
  assert(position);assert.equal(position.mode,'pauschalen');assert.equal(position.source.id,'pauschalen');
  assert.equal(position.amounts.points.decimal,'7537.84');
  // Keep literal code, ID, counts, source identity and all original fields valid.
  // OLD rejects arrays only later as "Detailfelder"; do not falsify source.id to hide that fact.
  position.mode=bad;
  assert.throws(()=>validateLocalCatalog(changed,profile),/^Error: Ungültige lokale Tarifposition\.$/);
  assert.equal(position.source.id,'pauschalen');assert.equal(position.id,'pauschalen:C00.10A');
 });
 test(`local context rejects ${label} mode without coercing its existing ID`,{skip:catalog?false:'Private catalog absent; real-table mode validation not executed'},()=>{
  const changed=structuredClone(catalog),context=changed.contexts.find(t=>t.mode==='pauschalen');
  assert(context);const id=context.id,rows=structuredClone(context.rows);
  context.mode=bad;
  assert.throws(()=>validateLocalCatalog(changed,profile),/^Error: Ungültige Begleittabelle\.$/);
  assert.equal(context.id,id);assert.deepEqual(context.rows,rows);
 });
}

test('real catalog primitive controls remain valid and unchanged',{skip:catalog?false:'Private catalog absent; full primitive control not executed'},()=>{
 const original=structuredClone(catalog);
 assert.equal(validateLocalCatalog(catalog,profile),catalog);
 assert.deepEqual(catalog,original);
 assert.deepEqual(Object.fromEntries(['tardoc','pauschalen'].map(mode=>[mode,catalog.positions.filter(p=>p.mode===mode).length])),profile.counts);
});
