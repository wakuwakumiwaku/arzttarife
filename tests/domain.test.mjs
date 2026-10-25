import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculate,money,quantity,scaled,validateReference,emptyWorkspace,validateWorkspace,filterRecords,WorkspaceStore,STORAGE_KEY,verifyCatalogText,validateLocalCatalog} from '../src/domain.js';
const reference=JSON.parse(await readFile(new URL('../public/data/reference.json',import.meta.url)));
const profile=JSON.parse(await readFile(new URL('../public/data/local-profile.json',import.meta.url)));
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};
test('decimal calculation has exact final half-up rounding, not binary float or 5Rp rounding',()=>{
 assert.equal(calculate('tardoc',{al:'0.1',ipl:'0.2',tpw:'0.95',quantity:'1'}).cents,29n);
 assert.equal(calculate('pauschalen',{points:'0,005',tpw:'1',quantity:'1'}).cents,1n);
 assert.equal(calculate('pauschalen',{points:'0.005',tpw:'1',quantity:'2'}).cents,1n);
 assert.equal(calculate('tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'}).cents,1747n);
 assert.equal(calculate('pauschalen',{points:'7537.84',tpw:'0.91',quantity:'1'}).cents,685943n);
 assert.equal(money(1747n),'CHF 17.47');assert.equal(money(100000n),'CHF 1’000.00');
});
test('missing, malformed, negative and excessive values never become zero',()=>{
 for(const bad of ['',null,1,'-1','1e3','NaN','1.00001',' 1','01','1000001'])assert.throws(()=>scaled(bad,4,1000000,'TP'));
 for(const bad of ['0','-1','1.1','100001',' 1'])assert.throws(()=>quantity(bad));
 for(const f of [{points:'',tpw:'1',quantity:'1'},{points:'1',tpw:'',quantity:'1'},{points:'1',tpw:'0',quantity:'1'}])assert.throws(()=>calculate('pauschalen',f));
 assert.throws(()=>calculate('__proto__',{}));
});
test('strict workspace ID/type/version validation; preview does not mutate input or persistence',()=>{
 const e=emptyWorkspace(reference);assert.deepEqual(validateWorkspace(e,reference),e);
 const variants=[{...e,version:'1'},{...e,app:'migel.workspace'},{...e,edition:'2027'},{...e,mode:'__proto__'},{...e,favorites:['not-known']},{...e,favorites:['rights','rights']},{...e,extra:true},{...e,calculators:{...e.calculators,pauschalen:{points:1,tpw:'',quantity:'1'}}}];
 for(const v of variants)assert.throws(()=>validateWorkspace(v,reference));
 const result=validateWorkspace(e,reference);result.calculators.tardoc.al='1';assert.equal(e.calculators.tardoc.al,'');
});
test('complete reference and all token search across modes, categories, favorites and accents',()=>{
 validateReference(reference);assert.equal(reference.entries.length,16);
 assert.equal(filterRecords(reference.entries,{mode:'tardoc',query:'NORMIERUNGSFAKTOR'}).length,1);
 assert.equal(filterRecords(reference.entries,{mode:'pauschalen',query:'grouper'}).length,2);
 assert.equal(filterRecords(reference.entries,{mode:'tardoc',favoritesOnly:true,favorites:['rights']})[0].id,'rights');
 const bad=structuredClone(reference);bad.documents[0].url='javascript:alert(1)';assert.throws(()=>validateReference(bad));
});
test('storage is only explicit, key isolated; corrupt/blocked/foreign state stays byte-identical',()=>{
 const s=memory();s.setItem('migel.workspace.v1','canary');const st=new WorkspaceStore(s,reference);
 assert.equal(s.getItem(STORAGE_KEY),null);st.save(emptyWorkspace(reference));assert.equal(s.getItem('migel.workspace.v1'),'canary');
 const old=s.getItem(STORAGE_KEY);const other=new WorkspaceStore(s,reference);s.setItem(STORAGE_KEY,'external');assert.throws(()=>other.save(emptyWorkspace(reference)));assert.equal(s.getItem(STORAGE_KEY),'external');
 const corrupt=new WorkspaceStore(s,reference);assert(corrupt.blocked);assert.throws(()=>corrupt.save(emptyWorkspace(reference)));assert.equal(s.getItem(STORAGE_KEY),'external');
 const denied=new WorkspaceStore({getItem(){throw Error('denied');}},reference);assert(denied.blocked);assert.throws(()=>denied.save(emptyWorkspace(reference)));
 s.setItem(STORAGE_KEY,old);const quota=new WorkspaceStore({...s,setItem(){throw Error('quota');}},reference);assert.throws(()=>quota.save(emptyWorkspace(reference)));assert.equal(s.getItem(STORAGE_KEY),old);
});
test('cross-tab event locks dirty drafts without replacing them',()=>{
 const s=memory(),st=new WorkspaceStore(s,reference),draft=emptyWorkspace(reference);draft.calculators.tardoc.al='123.4';
 st.foreign('foreign');assert(st.blocked);assert.equal(draft.calculators.tardoc.al,'123.4');assert.throws(()=>st.save(draft));assert.equal(s.getItem(STORAGE_KEY),null);
});
test('real private local catalog passes full browser-domain validation and tamper detection when available',async t=>{
 let text;try{text=await readFile(new URL('../.local/catalog.json',import.meta.url),'utf8');}catch{t.skip('Private originals/catalog intentionally not distributed');return;}
 const c=await verifyCatalogText(text,profile);assert.equal(c.positions.length,1702);assert.equal(c.contexts.length,9);
 const changed=text.replace('Ärztliche Konsultation','Ärztliche KonsultatioX');assert.equal(Buffer.byteLength(changed),Buffer.byteLength(text));await assert.rejects(()=>verifyCatalogText(changed,profile),/SHA256/);
 const invalid=structuredClone(c);invalid.positions[0].id='tardoc:AA.00.001';assert.throws(()=>validateLocalCatalog(invalid,profile));
 const blank=structuredClone(c);blank.positions[0].amounts.al={kind:'numeric',decimal:'',raw:''};assert.throws(()=>validateLocalCatalog(blank,profile));
});

test('local catalog refuses altered hash, small subsets, ambiguous amount typing',async()=>{
 await assert.rejects(()=>verifyCatalogText('{}',profile));
 assert.throws(()=>validateLocalCatalog({app:profile.app,version:1,edition:profile.edition,sources:profile.sources,positions:[],contexts:[]},profile));
});

// RC-01: only these new tests may select the immutable OLD reference; production
// and all preceding tests always read their own unmodified default inputs.
async function roundingReference(){
 const file=process.env.TARIFF_REFERENCE_FILE||new URL('../public/data/reference.json',import.meta.url);
 const r=validateReference(JSON.parse(await readFile(file,'utf8')));
 return r.entries.find(e=>e.id==='round');
}
test('RC-01 summary attributes the release claim and discloses the actual longer XLSX raw values',async()=>{
 const r=await roundingReference();assert(r);
 assert.match(r.summary,/Release notes beschreiben Taxpunkte mit zwei Nachkommastellen/u,'The two-place claim must be attributed to the release notes, not asserted as an XLSX fact');
 assert.match(r.summary,/gepinnte XLSX enthält dennoch längere XML-Rohwerte/u,'The independently visible summary must disclose the contradictory pinned raw values');
 assert.doesNotMatch(r.summary,/Im aktualisierten TARDOC-Excel sind die Taxpunkte auf zwei Nachkommastellen gerundet/u);
 assert.deepEqual(r.sources,['release','tardoc']);
});
test('RC-01 detail distinguishes converter components, literal raw cells, source pin and unchecked master database',async()=>{
 const r=await roundingReference();assert(r);
 for(const [pattern,meaning]of [
  [/lokale Konverter rundet mit Decimal\/ROUND_HALF_UP/u,'explicit converter rounding, not a source property'],
  [/je AL-\/IPL-Komponente auf zwei Nachkommastellen/u,'component-level two-place rounding'],
  [/unveränderte Originalzelle bleibt separat in raw/u,'raw cell preservation'],
  [/decimal ist die gerundete Rechenbasis/u,'rounded decimal is distinct from raw'],
  [/hashgeprüfte XLSX 1\.4c_260402 gepinnt/u,'exact pinned source edition'],
  [/offizielle Datenbank bei Widersprüchen die Masterversion/u,'official database precedence'],
  [/Abgleich aller Positionen gegen diese Datenbank ist hier nicht implementiert/u,'no claim of a full database comparison']
 ])assert.match(r.detail,pattern,meaning);
});
test('RC-01 optional real catalog preserves non-two-place raw components with independent exact half-up values',async t=>{
 let text;try{text=await readFile(new URL('../.local/catalog.json',import.meta.url),'utf8');}
 catch(e){if(e.code!=='ENOENT')throw e;t.skip('Private real catalog intentionally absent; no raw-source assertion executed');return;}
 const c=await verifyCatalogText(text,profile);let checked=0,nontrivialLongRaw=0;
 // Independent digit/BigInt oracle: do not call the Python converter or calculate.
 // No real codes, amounts or source rows are embedded in this public test.
 for(const p of c.positions)for(const a of Object.values(p.amounts)){
  if(a.kind!=='numeric')continue;
  const literal=a.raw,normalized=literal.replaceAll("'",'');assert.match(normalized,/^[0-9]+(?:\.[0-9]+)?$/u);
  const [whole,fraction='']=normalized.split('.');
  let cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2));
  if(fraction.length>2&&fraction[2]>='5')cents++;
  const expected=`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
  assert.equal(a.decimal,expected);checked++;
  if(p.mode==='tardoc'&&fraction.length>2&&/[1-9]/u.test(fraction.slice(2)))nontrivialLongRaw++;
 }
 assert(checked>0);assert(nontrivialLongRaw>0,'Real pinned TARDOC contains meaningful digits beyond two places, not just trailing zeros');
});
