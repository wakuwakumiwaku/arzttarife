// Registered native Firefox acceptance runner. Never imported by npm test.
// Requires an external playwright-core module and Firefox executable; installs nothing.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {createAppServer} from '../scripts/serve.mjs';
import {runtimeFiles} from '../scripts/files.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const key='arzttarife.workspace.v1';
const otherKeys=['dentotar.workspace.v1','migel.workspace.v1','sl.workspace.v1','analysenliste.workspace.v1','pflegefinanzierung.workspace.v1','arzneimittelliste.workspace.v1','physiotherapie.workspace.v1','spitaltarife.workspace.v1'];
const sentinels=Object.fromEntries(otherKeys.map((k,i)=>[k,`  {"native-sentinel":${i},"literal":"ä / \\n"}  `]));
const basePath='/arzttarife/';
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const reference=await json('public/data/reference.json'),profile=await json('public/data/local-profile.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const empty=()=>({app:'arzttarife.workspace',version:1,edition:reference.edition,mode:'tardoc',calculators:{tardoc:{al:'',ipl:'',tpw:'',quantity:'1'},pauschalen:{points:'',tpw:'',quantity:'1'}},favorites:[]});
const clone=v=>structuredClone(v);
const expectedRows=mode=>reference.entries.filter(r=>r.mode===mode||r.mode==='both');
const card=(p,id)=>p.locator(`#results article[data-id=${JSON.stringify(id)}]`);
let fixture=null,fixtureFile=null;
const requestedFixture=process.env.LOCAL_CATALOG_FILE;
const defaultFixture=path.join(root,'.local','catalog.json');
try{
 fixtureFile=requestedFixture?path.resolve(requestedFixture):defaultFixture;
 fixture=await readFile(fixtureFile);
}catch(e){if(e.code!=='ENOENT')throw e;fixtureFile=null;}
const catalog=fixture?JSON.parse(fixture.toString('utf8')):null;
if(fixture){
 assert.equal(fixture.length,profile.bytes);assert.equal(sha(fixture),profile.sha256);
 assert.equal(catalog.app,profile.app);assert.equal(catalog.version,1);assert.equal(catalog.edition,profile.edition);
 assert.deepEqual(catalog.sources,profile.sources);assert.equal(catalog.positions.length,1702);assert.equal(catalog.contexts.length,9);
 for(const mode of ['tardoc','pauschalen'])assert.equal(catalog.positions.filter(p=>p.mode===mode).length,profile.counts[mode]);
 assert.equal(new Set(catalog.positions.map(p=>p.id)).size,1702);
}

// Independent Python Decimal oracle, not the application calculate/money implementation.
const vectors=[
 ['tardoc',{al:'0.1',ipl:'0.2',tpw:'0.95',quantity:'1'}],
 ['tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'}],
 ['tardoc',{al:'0.0001',ipl:'0.0001',tpw:'0.123456',quantity:'100000'}],
 ['tardoc',{al:'1,2345',ipl:'6,7890',tpw:'0,918273',quantity:'17'}],
 ['pauschalen',{points:'7537.84',tpw:'0.91',quantity:'1'}],
 ['pauschalen',{points:'0.005',tpw:'1',quantity:'1'}],
 ['pauschalen',{points:'0.005',tpw:'1',quantity:'2'}],
 ['pauschalen',{points:'999999.9999',tpw:'999.999999',quantity:'100000'}]
];
const oracle=spawnSync('python3',['-c',`import sys,json
from decimal import Decimal,ROUND_HALF_UP,localcontext
out=[]
with localcontext() as ctx:
 ctx.prec=80
 for mode,f in json.load(sys.stdin):
  d=lambda x:Decimal(x.replace(',','.'))
  points=d(f['al'])+d(f['ipl']) if mode=='tardoc' else d(f['points'])
  amount=(points*d(f['tpw'])*d(f['quantity'])).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
  out.append('CHF '+format(amount,',.2f').replace(',','’'))
json.dump(out,sys.stdout,ensure_ascii=False)
`],{input:JSON.stringify(vectors),encoding:'utf8'});
assert.equal(oracle.status,0,oracle.stderr);const expectedAmounts=JSON.parse(oracle.stdout);

const selfTest=process.argv.includes('--self-test');
const listOnly=process.argv.includes('--list')||selfTest;
if(!listOnly)await mkdir(path.join(root,'.local/browser'),{recursive:true});
const run=listOnly?null:await mkdtemp(path.join(root,'.local/browser','RUN-'));
const report={schemaVersion:1,status:'running',scope:'native local /arzttarife/, limited public reference; optional private file remains local',node:process.version,python:spawnSync('python3',['--version'],{encoding:'utf8'}).stdout.trim(),browser:null,runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),runtimeHashes:{},fixture:fixture?{bytes:fixture.length,sha256:sha(fixture),positions:1702,contexts:9}:{status:'absent',privateCases:'explicitly skipped'},cases:[],channels:[],downloads:[],screenshots:[],instrumentation:['disposable contexts only; eight exact foreign-namespace sentinels','Storage.getItem/setItem failpoints target only this app key; native raw accessor retained','File.text deferred at declared I/O boundary, original native file bytes read on release','DOM MutationObserver observes completed import; no product state/module replacement','no network fault injection; console/page/network failure allowlist is empty'],cleanup:{contexts:false,browser:false,server:false}};
let browser,server,origin,url,currentCase=null;
const contexts=new Set(),caseDefs=[];
const checkpoint=()=>writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2)+'\n');
const register=(name,fn,{privateOnly=false}={})=>caseDefs.push({name,fn,privateOnly});
const text=(p,selector)=>p.locator(selector).textContent();
const raw=(p)=>p.evaluate(k=>window.__qaStorage.get(k),key);
const isClosed=async(p,id)=>assert.equal(await p.locator(id).evaluate(e=>e.open),false);
async function waitReady(p){await p.waitForFunction(()=>document.body.dataset.ready==='true');assert.equal(await p.locator('#fatal').isVisible(),false);}
async function fields(p,mode,values){await p.locator('#mode-'+mode).click();for(const [k,v]of Object.entries(values))await p.locator('#'+k).fill(v);}
async function assertFields(p,mode,values){await p.locator('#mode-'+mode).click();for(const [k,v]of Object.entries(values))assert.equal(await p.locator('#'+k).inputValue(),v,`${mode}.${k}`);}
async function save(p){await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Gespeicherter Arbeitsstand geladen.');}
async function selectFile(p,id,file){
 // Observe a FRESH handled outcome even when two invalid files have the same error text.
 const outcome=p.evaluate(()=>new Promise((resolve,reject)=>{
  const dialog=document.querySelector('#import-dialog'),notice=document.querySelector('#notice');
  const timer=setTimeout(()=>{observer.disconnect();reject(Error('No handled native file-input outcome'));},15000);
  const observer=new MutationObserver(()=>{if(dialog.open||notice.textContent.startsWith('Nicht geöffnet: ')){clearTimeout(timer);observer.disconnect();resolve(dialog.open?'preview':notice.textContent);}});
  observer.observe(dialog,{attributes:true,attributeFilter:['open']});observer.observe(notice,{childList:true,subtree:true,characterData:true});
 }));
 await p.locator(id).setInputFiles(file);
 return outcome;
}
const upload=(name,value)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function cancel(p){await p.locator('#cancel-import').click();await isClosed(p,'#import-dialog');}
async function confirm(p){await p.locator('#confirm-import').click();await isClosed(p,'#import-dialog');}
async function download(p,label){
 const event=p.waitForEvent('download');await p.locator('#export').click();const d=await event;
 assert.equal(d.suggestedFilename(),'arzttarife-arbeitsstand.json');
 const file=path.join(run,`${String(report.downloads.length+1).padStart(2,'0')}-${label}.json`);
 await d.saveAs(file);assert.equal(await d.failure(),null);
 const bytes=await readFile(file),value=JSON.parse(bytes.toString('utf8'));
 report.downloads.push({file:path.basename(file),bytes:bytes.length,sha256:sha(bytes),case:currentCase});
 assert.deepEqual(Object.keys(value).sort(),['app','version','edition','mode','calculators','favorites'].sort());
 assert.equal(value.app,'arzttarife.workspace');assert.equal(value.version,1);assert.equal(value.edition,reference.edition);
 assert.deepEqual(Object.keys(value.calculators).sort(),['pauschalen','tardoc']);
 assert.deepEqual(Object.keys(value.calculators.tardoc).sort(),['al','ipl','tpw','quantity'].sort());
 assert.deepEqual(Object.keys(value.calculators.pauschalen).sort(),['points','tpw','quantity'].sort());
 for(const f of Object.values(value.calculators))for(const v of Object.values(f))assert.equal(typeof v,'string');
 assert(value.favorites.every(id=>reference.entries.some(r=>r.id===id)));
 return {file,value};
}
async function screenshot(p,label){const file=label+'.png';await p.screenshot({path:path.join(run,file)});report.screenshots.push({file,case:currentCase});}
function observePage(p,channel){
 p.on('pageerror',e=>channel.errors.push({kind:'pageerror',message:e.message}));
 p.on('console',m=>{channel.console.push({type:m.type(),text:m.text(),location:m.location()});if(['warning','warn','error','assert'].includes(m.type()))channel.errors.push({kind:'console',type:m.type(),message:m.text()});});
 p.on('request',r=>{
  channel.requests.push({method:r.method(),url:r.url(),resourceType:r.resourceType()});
  const u=new URL(r.url());if(u.protocol==='blob:')return;
  if(u.origin!==origin||u.search||r.method()!=='GET'||!Object.hasOwn(runtimeFiles,u.pathname.slice(basePath.length)||'index.html')||!u.pathname.startsWith(basePath))channel.errors.push({kind:'unexpected-request',method:r.method(),url:r.url()});
 });
 p.on('requestfailed',r=>channel.errors.push({kind:'requestfailed',url:r.url(),message:r.failure()?.errorText}));
 p.on('response',r=>{channel.responses.push({url:r.url(),status:r.status()});if(r.status()>=400)channel.errors.push({kind:'http',url:r.url(),status:r.status()});});
 p.on('dialog',async d=>{channel.errors.push({kind:'unexpected-native-dialog',type:d.type(),message:d.message()});await d.dismiss();});
}
async function withPage(fn,{seed=null,storageFault=null,fileIO=false}={}){
 const c=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});contexts.add(c);
 const channel={case:currentCase,console:[],requests:[],responses:[],errors:[],pageCount:0};report.channels.push(channel);
 // Every page, including external-change sender tabs, gets all collectors before navigation.
 c.on('page',p=>{channel.pageCount++;observePage(p,channel);});
 await c.addInitScript(({key,sentinels,seed,storageFault,fileIO,origin})=>{
  if(location.origin!==origin)return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  window.__qaStorage={get:k=>get.call(localStorage,k),set:(k,v)=>set.call(localStorage,k,v)};
  if(get.call(localStorage,'__arzttarife_native_seed__')===null){
   for(const [k,v]of Object.entries(sentinels))set.call(localStorage,k,v);
   if(seed!==null)set.call(localStorage,key,seed);
   set.call(localStorage,'__arzttarife_native_seed__','owned');
  }
  if(storageFault==='read')Storage.prototype.getItem=function(k){if(k===key)throw new DOMException('Injected app-key read denial','SecurityError');return get.call(this,k);};
  if(storageFault==='write')Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Injected app-key write denial','QuotaExceededError');return set.call(this,k,v);};
  if(fileIO){
   const original=File.prototype.text;
   window.__fileIO={hold:[],pending:[],completed:[],handlerSettled:[],handlerErrors:[]};
   // DOM listener boundary: invoke the original change callback once and
   // acknowledge its returned async completion, including obsolete no-op reads.
   const add=EventTarget.prototype.addEventListener;
   EventTarget.prototype.addEventListener=function(type,listener,options){
    if(type==='change'&&['workspace-file','catalog-file'].includes(this.id)&&typeof listener==='function'){
     return add.call(this,type,function(event){
      const name=this.files?.[0]?.name,completion=listener.call(this,event);
      Promise.resolve(completion).then(()=>window.__fileIO.handlerSettled.push(name),error=>window.__fileIO.handlerErrors.push({name,message:String(error)}));
      return completion;
     },options);
    }
    return add.call(this,type,listener,options);
   };
   File.prototype.text=function(){
    if(!window.__fileIO.hold.includes(this.name))return original.call(this);
    return new Promise((resolve,reject)=>window.__fileIO.pending.push({name:this.name,release:()=>original.call(this).then(value=>{window.__fileIO.completed.push(this.name);resolve(value);},reject)}));
   };
  }
 },{key,sentinels,seed,storageFault,fileIO,origin});
 let p;
 try{
  p=await c.newPage();await p.goto(url);await waitReady(p);await fn(p,c,channel);
  const foreign=await p.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,window.__qaStorage.get(k)])),otherKeys);
  assert.deepEqual(foreign,sentinels,'foreign namespaces must be byte-identical');
  assert.deepEqual(channel.errors,[],'all page/console/network channels must be clean (empty allowlist)');
 }catch(e){if(p&&!p.isClosed())await screenshot(p,`failure-${report.cases.length+1}`).catch(()=>{});throw e;}
 finally{await c.close();contexts.delete(c);}
}
async function enumerate(p,expected){
 let previous=0;
 for(;;){
  const ids=await p.locator('#results article[data-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  assert.deepEqual(ids,expected.slice(0,ids.length));assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.length,Math.min(previous+30,expected.length));
  assert.equal(await text(p,'#count'),`${expected.length} Treffer · ${ids.length} angezeigt`);
  if(await p.locator('#more').isHidden()){assert.deepEqual(ids,expected);return ids;}
  previous=ids.length;await p.locator('#more').click();
 }
}
async function openDetail(p,id){await card(p,id).locator('.detail-link').click();assert.equal(await p.locator('#detail-dialog').evaluate(e=>e.open),true);}
const detailPairs=p=>p.locator('#detail-body h3').evaluateAll(nodes=>nodes.map(n=>[n.textContent,n.nextElementSibling.textContent]));
async function closeDetail(p){await p.locator('#close-detail').click();await isClosed(p,'#detail-dialog');}
async function importCatalog(p){assert(fixtureFile);assert.equal(await selectFile(p,'#catalog-file',fixtureFile),'preview');assert.match(await text(p,'#import-body'),/Geprüfter Hash und vollständiges Schema: 1 702 Positionen/);await confirm(p);assert.match(await text(p,'#catalog-status'),/Vollständig lokal geladen/);}
async function show(p,mode,view,query=''){await p.locator('#mode-'+mode).click();await p.locator('#view').selectOption(view);await p.locator('#search').fill(query);await p.locator('#category').selectOption('');}

register('public startup: 16 genuine references, nine exact official links, zero hosted positions',()=>withPage(async p=>{
 assert.equal(reference.entries.length,16);assert.equal(reference.documents.length,9);
 const all=new Set();
 for(const mode of ['tardoc','pauschalen']){await p.locator('#mode-'+mode).click();const rows=expectedRows(mode);await enumerate(p,rows.map(r=>r.id));for(const r of rows)all.add(r.id);}
 assert.equal(all.size,16);
 assert.deepEqual(await p.locator('#sources a').evaluateAll(nodes=>nodes.map(a=>({title:a.textContent,url:a.href}))),reference.documents.map(d=>({title:d.title,url:d.url})));
 assert.match(await text(p,'.scope'),/keine eingebetteten Tarifpositionen/);
 assert.equal(await p.locator('#tpw').inputValue(),'');assert.equal(await raw(p),null);
 for(const view of ['positions','contexts']){await p.locator('#view').selectOption(view);assert.equal(await p.locator('#results article').count(),0);assert.match(await text(p,'#count'),/Kein lokaler Katalog geladen/);}
}));

register('source-only reference details, full search/category/reset/favorites and independent mode fields',()=>withPage(async p=>{
 const seen=new Set();
 for(const mode of ['tardoc','pauschalen']){
  await show(p,mode,'reference');
  for(const r of expectedRows(mode)){
   if(seen.has(r.id))continue;seen.add(r.id);await openDetail(p,r.id);
   assert.equal(await text(p,'#detail-title'),r.title);
   assert.deepEqual(await detailPairs(p),[['Kurzreferenz',r.summary],['Anwendung und Grenze',r.detail],['Offizielle Quellen',r.sources.map(id=>reference.documents.find(d=>d.id===id).title).join('')]]);
   assert.deepEqual(await p.locator('#detail-body a').evaluateAll(nodes=>nodes.map(a=>a.href)),r.sources.map(id=>reference.documents.find(d=>d.id===id).url));
   await closeDetail(p);
  }
 }
 assert.equal(seen.size,16);
 await show(p,'tardoc','reference','NORMIERUNGSFAKTOR');
 assert.deepEqual(await p.locator('#results article').evaluateAll(ns=>ns.map(n=>n.dataset.id)),reference.entries.filter(r=>(r.mode==='tardoc'||r.mode==='both')&&[r.title,r.summary,r.detail].join(' ').toLowerCase().includes('normierungsfaktor')).map(r=>r.id));
 await p.locator('#reset').click();const first=expectedRows('tardoc')[0];
 await p.locator('#category').selectOption(first.category);
 assert.deepEqual(await p.locator('#results article').evaluateAll(ns=>ns.map(n=>n.dataset.id)),expectedRows('tardoc').filter(r=>r.category===first.category).map(r=>r.id));
 await card(p,first.id).locator('.result-footer button').click();await p.locator('#favorites-only').check();
 assert.deepEqual(await p.locator('#results article').evaluateAll(ns=>ns.map(n=>n.dataset.id)),[first.id]);
 await p.locator('#reset').click();assert.equal(await p.locator('#search').inputValue(),'');assert.equal(await p.locator('#category').inputValue(),'');assert.equal(await p.locator('#favorites-only').isChecked(),false);
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'3'});
 await fields(p,'pauschalen',{points:'7537.84',tpw:'0.92',quantity:'2'});
 await assertFields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'3'});
 await assertFields(p,'pauschalen',{points:'7537.84',tpw:'0.92',quantity:'2'});
 assert.equal(await raw(p),null);const d=await download(p,'mode-fields');assert.deepEqual(d.value.favorites,[first.id]);
}));

register('exact native calculators against independent 80-digit Python Decimal oracle and invalid inputs',()=>withPage(async p=>{
 for(let i=0;i<vectors.length;i++){
  const [mode,f]=vectors[i];await fields(p,mode,f);await p.locator('#calc-form button').click();
  assert.equal(await text(p,'#amount'),expectedAmounts[i],JSON.stringify(vectors[i]));
 }
 for(const bad of ['', '0','-1','1e3','NaN','1.0000001']){await p.locator('#tpw').fill(bad);assert.equal(await text(p,'#amount'),'Kein berechenbarer Betrag');}
 await fields(p,'tardoc',{al:'',ipl:'8.64',tpw:'0.91',quantity:'1'});assert.equal(await text(p,'#amount'),'Kein berechenbarer Betrag');
 await fields(p,'pauschalen',{points:'1',tpw:'1',quantity:'0'});assert.equal(await text(p,'#amount'),'Kein berechenbarer Betrag');
 assert.equal(await raw(p),null);
}));

register('native downloaded JSON: preview/cancel, replace as unsaved, explicit save and fresh reload',()=>withPage(async p=>{
 const original=empty();Object.assign(original.calculators.tardoc,{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'2'});
 original.calculators.pauschalen={points:'7537.84',tpw:'0.92',quantity:'3'};original.favorites=[reference.entries[0].id];original.mode='pauschalen';
 await fields(p,'tardoc',original.calculators.tardoc);await card(p,original.favorites[0]).locator('.result-footer button').click();await fields(p,'pauschalen',original.calculators.pauschalen);await save(p);
 const before=await raw(p);assert.deepEqual(JSON.parse(before),original);
 const d=await download(p,'roundtrip');assert.deepEqual(d.value,original);
 await fields(p,'pauschalen',{points:'44'});assert.equal(await raw(p),before);
 assert.equal(await selectFile(p,'#workspace-file',d.file),'preview');assert.equal(await raw(p),before);assert.equal(await p.locator('#points').inputValue(),'44');await cancel(p);assert.equal(await p.locator('#points').inputValue(),'44');
 assert.equal(await selectFile(p,'#workspace-file',d.file),'preview');await confirm(p);assert.equal(await raw(p),before);assert.equal(await p.locator('#points').inputValue(),'7537.84');assert.match(await text(p,'#storage-status'),/Ungespeicherter Entwurf/);
 // Make replacement visibly different from populated storage, not merely equal JSON.
 const replacement=clone(original);replacement.mode='tardoc';replacement.calculators.tardoc.al='21.12';replacement.calculators.pauschalen.points='15075.68';
 assert.equal(await selectFile(p,'#workspace-file',upload('replacement.json',replacement)),'preview');await confirm(p);assert.equal(await raw(p),before);
 await assertFields(p,'tardoc',replacement.calculators.tardoc);await assertFields(p,'pauschalen',replacement.calculators.pauschalen);await p.locator('#mode-tardoc').click();
 await save(p);assert.deepEqual(JSON.parse(await raw(p)),replacement);await p.reload();await waitReady(p);
 assert.equal(await p.locator('#mode-tardoc').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#al').inputValue(),'21.12');
 await assertFields(p,'pauschalen',replacement.calculators.pauschalen);assert.deepEqual((await download(p,'reloaded')).value.calculators,replacement.calculators);
 assert.match(await text(p,'#catalog-status'),/Kein lokaler Katalog geladen/);
}));

register('invalid later fields/types/versions/IDs preserve populated raw storage AND dirty draft',()=>withPage(async p=>{
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await save(p);const before=await raw(p);await p.locator('#al').fill('123.45');
 const valid=JSON.parse(before),variants=[
  v=>v.calculators.pauschalen.quantity='100001',v=>v.calculators.pauschalen.points=1,v=>v.version='1',v=>v.version=2,
  v=>v.mode=['pauschalen'],v=>v.mode=[['pauschalen']],v=>v.mode={},v=>v.favorites=['not-a-reference'],v=>v.calculators.tardoc.extra='1'
 ];
 for(let i=0;i<variants.length;i++){
  const bad=clone(valid);variants[i](bad);assert.match(await selectFile(p,'#workspace-file',upload(`invalid-${i}.json`,bad)),/^Nicht geöffnet:/);
  await isClosed(p,'#import-dialog');assert.equal(await raw(p),before);assert.equal(await p.locator('#al').inputValue(),'123.45');
 }
 const d=await download(p,'invalid-import-draft');assert.equal(d.value.calculators.tardoc.al,'123.45');
}));

for(const fault of ['corrupt','read','write'])register(`${fault} storage keeps raw before-image and exportable dirty draft`,()=>withPage(async p=>{
 const before=await raw(p);await fields(p,'tardoc',{al:'123.45',ipl:'8.64',tpw:'0.91',quantity:'1'});
 if(fault==='write'){await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#save').disabled);}
 assert.equal(await p.locator('#save').isDisabled(),true);assert.equal(await raw(p),before);assert.equal(await p.locator('#al').inputValue(),'123.45');
 assert.equal((await download(p,`storage-${fault}`)).value.calculators.tardoc.al,'123.45');
},{seed:fault==='corrupt'?'{broken before-image':JSON.stringify(empty()),storageFault:fault==='corrupt'?null:fault}));

register('real second-tab external storage event locks writes without replacing dirty fields',()=>withPage(async(p,c)=>{
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await save(p);await p.locator('#al').fill('123.45');
 const external=empty();external.calculators.tardoc.al='99.99';const externalRaw='  '+JSON.stringify(external)+'  ';
 const sender=await c.newPage();await sender.goto(url);await waitReady(sender);await sender.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:externalRaw});
 await p.waitForFunction(()=>document.querySelector('#save').disabled);assert.match(await text(p,'#storage-status'),/Fremdänderung/);assert.equal(await raw(p),externalRaw);assert.equal(await p.locator('#al').inputValue(),'123.45');
 assert.equal((await download(p,'external-dirty')).value.calculators.tardoc.al,'123.45');
 await p.locator('#reload-workspace').click();assert.equal(await p.locator('#import-dialog').evaluate(e=>e.open),true);await cancel(p);assert.equal(await p.locator('#al').inputValue(),'123.45');assert.equal(await raw(p),externalRaw);await sender.close();
}));

register('held native File.text: later preview cancellation invalidates stale completion',()=>withPage(async p=>{
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await save(p);const before=await raw(p);await p.locator('#al').fill('123.45');
 await p.evaluate(()=>window.__fileIO.hold.push('held.json'));
 const old=empty();old.calculators.tardoc.al='777';
 await p.locator('#workspace-file').setInputFiles(upload('held.json',old));await p.waitForFunction(()=>window.__fileIO.pending.length===1);
 const newer=empty();newer.calculators.tardoc.al='888';assert.equal(await selectFile(p,'#workspace-file',upload('newer.json',newer)),'preview');await cancel(p);
 await p.evaluate(()=>window.__fileIO.pending[0].release());await p.waitForFunction(()=>window.__fileIO.completed.includes('held.json'));
 // Drain the actual async read continuation, not a synthetic timer approximation.
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await isClosed(p,'#import-dialog');assert.equal(await p.locator('#al').inputValue(),'123.45');assert.equal(await raw(p),before);
},{fileIO:true}));

register('private native file: exact bytes/hash, schema preview/cancel/confirm, complete positions and source details',()=>withPage(async p=>{
 const before=await raw(p);
 assert.equal(await selectFile(p,'#catalog-file',fixtureFile),'preview');assert.equal(await raw(p),before);assert.equal(await p.locator('#unload-catalog').isDisabled(),true);
 assert.match(await text(p,'#import-body'),/1 388 TARDOC und 314 Pauschalen; neun Begleittabellen/);await cancel(p);
 await show(p,'tardoc','positions');assert.equal(await p.locator('#results article').count(),0);
 await importCatalog(p);assert.equal(await raw(p),before);
 for(const mode of ['tardoc','pauschalen']){
  await show(p,mode,'positions');const rows=catalog.positions.filter(r=>r.mode===mode);await enumerate(p,rows.map(r=>r.id));
  assert.deepEqual(await p.locator('#results .detail-link').allTextContents(),rows.map(r=>r.code+' · '+r.title));
  // Exhaustive, not a sampled detail check: all source interpretations/raw cells/fields.
  for(const r of rows){
   await openDetail(p,r.id);assert.equal(await text(p,'#detail-title'),r.code+' · '+r.title);
   const expected=[['Original: Interpretation / Hinweis',r.interpretation||'Leere Quellzelle.'],...Object.entries(r.amounts).map(([k,a])=>[`${k==='points'?'Taxpunkte':k.toUpperCase()} · Originalzelle (${a.kind})`,a.raw||'Leere Quellzelle.']),...r.fields.map(f=>['Originalfeld: '+f.name,f.text||'Leere Quellzelle.']),['Quellstelle',`${r.source.sheet} · Excel-Zeile ${r.source.row} · ${profile.edition}`]];
   assert.deepEqual(await detailPairs(p),expected);
   assert.match(await text(p,'#detail-body'),/Einzelkomponenten auf 2 Nachkommastellen kaufmännisch gerundet; Rohwerte oben unverändert/);
   assert.deepEqual(await p.locator('#detail-body a').evaluateAll(ns=>ns.map(a=>a.href)),[reference.documents.find(d=>d.id===mode).url]);await closeDetail(p);
  }
  (report.positionCoverage??={})[mode]={rows:rows.length,allLiteralIds:true,allOriginalDetails:true};
 }
 // Hash mismatch with unchanged actual file size; no schema error can masquerade as SHA proof.
 const bad=Buffer.from(fixture);const at=bad.indexOf('arzttarife.local-catalog');assert(at>=0);bad[at]=98;
 assert.match(await selectFile(p,'#catalog-file',{name:'tampered.json',mimeType:'application/json',buffer:bad}),/SHA256/);
 assert.match(await text(p,'#catalog-status'),/Nicht geöffnet:/);assert.equal(await p.locator('#unload-catalog').isDisabled(),false);
 await show(p,'pauschalen','positions');await enumerate(p,catalog.positions.filter(r=>r.mode==='pauschalen').map(r=>r.id));
 assert.match(await selectFile(p,'#catalog-file',upload('too-small.json',{})),/Dateigrösse/);assert.equal(await raw(p),before);
}),{privateOnly:true});

register('private nine complete context tables: every original row and full original cell rendered in details',()=>withPage(async p=>{
 await importCatalog(p);const seen=new Set();let rowCount=0;
 for(const t of catalog.contexts){
  await show(p,t.mode,'contexts');await p.locator('#category').selectOption(t.sheet);
  const ids=t.rows.map(r=>`${t.id}:${r.row}`);await enumerate(p,ids);seen.add(t.id);
  for(const r of t.rows){const id=`${t.id}:${r.row}`;await openDetail(p,id);assert.equal(await text(p,'#detail-title'),`${t.sheet} · Zeile ${r.row}`);assert.deepEqual(await detailPairs(p),Object.entries(r.cells).map(([k,v])=>['Originalspalte '+k,v||'Leere Quellzelle.']));await closeDetail(p);rowCount++;}
 }
 assert.equal(seen.size,9);assert.equal(rowCount,catalog.contexts.reduce((n,t)=>n+t.rows.length,0));
 report.contextCoverage={tables:[...seen],rows:rowCount,allOriginalCells:true};
}),{privateOnly:true});

register('private known points/open/percentage, native JSON without catalog, unload and reload boundary',()=>withPage(async p=>{
 await importCatalog(p);let expected=empty();
 for(const [mode,code]of [['tardoc','AA.00.0010'],['pauschalen','C00.10A'],['pauschalen','C90.03Z'],['tardoc','AA.30.0050']]){
  await show(p,mode,'positions',code);await card(p,mode+':'+code).locator('.result-footer button').click();await p.locator('#tpw').fill('0.91');
  if(code==='AA.00.0010'){assert.equal(await p.locator('#al').inputValue(),'10.56');assert.equal(await p.locator('#ipl').inputValue(),'8.64');assert.equal(await text(p,'#amount'),expectedAmounts[1]);}
  if(code==='C00.10A'){assert.equal(await p.locator('#points').inputValue(),'7537.84');assert.equal(await text(p,'#amount'),expectedAmounts[4]);}
  if(code==='C90.03Z'){assert.equal(await p.locator('#points').inputValue(),'');assert.equal(await text(p,'#amount'),'Kein berechenbarer Betrag');}
  if(code==='AA.30.0050'){assert.equal(await p.locator('#al').inputValue(),'');assert.equal(await p.locator('#ipl').inputValue(),'');assert.equal(await text(p,'#amount'),'Kein berechenbarer Betrag');}
 }
 await show(p,'tardoc','reference');const favorite=expectedRows('tardoc')[0].id;await card(p,favorite).locator('.result-footer button').click();
 await show(p,'tardoc','positions','AA.00.0010');await card(p,'tardoc:AA.00.0010').locator('.result-footer button').click();
 expected.calculators.tardoc={al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'};expected.calculators.pauschalen={points:'',tpw:'0.91',quantity:'1'};expected.favorites=[favorite];
 await save(p);const before=await raw(p),d=await download(p,'private-boundary');assert.deepEqual(d.value,expected);
 const downloaded=await readFile(d.file,'utf8');for(const forbidden of ['positions','contexts','interpretation',catalog.positions[0].title])assert.equal(downloaded.includes(forbidden),false,forbidden);
 await p.locator('#unload-catalog').click();assert.match(await text(p,'#catalog-status'),/Kein lokaler Katalog geladen/);assert.equal(await p.locator('#al').inputValue(),'10.56');
 await importCatalog(p);await p.reload();await waitReady(p);assert.match(await text(p,'#catalog-status'),/Kein lokaler Katalog geladen/);assert.equal(await p.locator('#view').inputValue(),'reference');assert.equal(await p.locator('#al').inputValue(),'10.56');assert.equal(await raw(p),before);
 assert.equal(await card(p,favorite).locator('.result-footer button').getAttribute('aria-pressed'),'true');
}),{privateOnly:true});

register('canonical native directory: closed extra six, nine unique targets and one current marker',()=>withPage(async p=>{
 const directory=p.locator('details.catalog-directory');assert.equal(await directory.evaluate(e=>e.open),false);
 assert.equal(await p.locator('.catalog-switch a').count(),3);assert.equal(await directory.locator('nav a').count(),6);
 for(const a of await directory.locator('nav a').all())assert.equal(await a.isVisible(),false);
 const targets=await p.locator('.catalog-switch a,.catalog-directory a').evaluateAll(ns=>ns.map(a=>({href:a.href,target:a.getAttribute('target'),current:a.getAttribute('aria-current')})));
 assert.equal(new Set(targets.map(a=>a.href)).size,9);assert.deepEqual(targets.map(a=>a.href).sort(),['dentotar','migel','spezialitaetenliste','analysenliste','pflegefinanzierung','arzneimittelliste','arzttarife','physiotherapie','spitaltarife'].map(x=>`https://wakuwakumiwaku.github.io/${x}/`).sort());
 assert.deepEqual(targets.filter(a=>a.current!==null),[{href:'https://wakuwakumiwaku.github.io/arzttarife/',target:null,current:'page'}]);assert(targets.every(a=>a.target===null));
 await directory.locator('summary').focus();await p.keyboard.press('Enter');assert.equal(await directory.evaluate(e=>e.open),true);for(const a of await directory.locator('nav a').all())assert.equal(await a.isVisible(),true);
 await directory.locator('summary').focus();await p.keyboard.press('Enter');assert.equal(await directory.evaluate(e=>e.open),false);
 assert.notEqual(await p.locator('.catalog-switch').evaluate(e=>getComputedStyle(e).position),'sticky');
}));

async function geometry(p,label){
 const result=await p.evaluate(()=>{
  const width=document.documentElement.clientWidth;
  const offenders=[...document.querySelectorAll('main,header,footer,.panel,.result,dialog[open],input,select')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,id:e.id,className:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,client:e.clientWidth,scroll:e.scrollWidth})).filter(r=>r.left< -1||r.right>width+1||r.scroll>r.client+1);
  return {width,documentWidth:document.documentElement.scrollWidth,offenders,fonts:{title:parseFloat(getComputedStyle(document.querySelector('.detail-link')).fontSize),inputs:[...document.querySelectorAll('#calc-form input')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,px:parseFloat(getComputedStyle(e).fontSize)})),money:parseFloat(getComputedStyle(document.querySelector('#amount')).fontSize)}};
 });
 (report.geometry??=[]).push({case:currentCase,label,...result});assert(result.documentWidth<=result.width+1,JSON.stringify(result));assert.deepEqual(result.offenders,[]);assert(result.fonts.title>=17);assert(result.fonts.money>=18);assert(result.fonts.inputs.every(f=>f.px>=17));
}
for(const width of [1440,768,390,320])register(`responsive ${width}: actual list, calculator bottom, native details bottom and 17/18px floors`,()=>withPage(async p=>{
 await p.setViewportSize({width,height:1000});
 let id;
 if(fixture){await importCatalog(p);const r=catalog.positions.filter(r=>r.mode==='tardoc').reduce((a,b)=>a.interpretation.length>b.interpretation.length?a:b);await show(p,'tardoc','positions',r.code);id=r.id;}
 else{await show(p,'tardoc','reference');id=expectedRows('tardoc')[0].id;}
 await card(p,id).scrollIntoViewIfNeeded();await geometry(p,'list');await screenshot(p,`${width}-list`);
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await p.locator('#calc-origin').scrollIntoViewIfNeeded();await geometry(p,'calculator-bottom');await screenshot(p,`${width}-calculator-bottom`);
 await openDetail(p,id);await p.locator('#detail-body > :last-child').scrollIntoViewIfNeeded();await geometry(p,'details-bottom');await screenshot(p,`${width}-details-bottom`);await p.keyboard.press('Escape');await isClosed(p,'#detail-dialog');
}));

register('light print media: actual body/panel/amount colors and print screenshot',()=>withPage(async p=>{
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await p.emulateMedia({media:'print'});
 const colors=await p.evaluate(()=>Object.fromEntries(['body','.panel','#amount'].map(s=>{const c=getComputedStyle(document.querySelector(s));return[s,{background:c.backgroundColor,color:c.color}];})));
 for(const c of Object.values(colors)){assert.equal(c.background,'rgb(255, 255, 255)');assert.equal(c.color,'rgb(0, 0, 0)');}
 assert.equal(await p.locator('.catalog-switch').isVisible(),false);await p.locator('#amount').scrollIntoViewIfNeeded();await screenshot(p,'light-print');await p.emulateMedia({media:'screen'});
}));

register('Q01 saved recovery: held native file input cannot replace saved preview or confirmed unsaved draft',()=>withPage(async p=>{
 await fields(p,'tardoc',{al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'});await save(p);
 const beforeRaw=await raw(p),saved=JSON.parse(beforeRaw);await p.locator('#al').fill('123.45');
 const dirty=(await download(p,'q01-dirty-before')).value;assert.equal(dirty.calculators.tardoc.al,'123.45');
 const older=clone(saved);older.calculators.tardoc.al='777';
 await p.evaluate(()=>window.__fileIO.hold.push('q01-older-held.json'));
 await p.locator('#workspace-file').setInputFiles(upload('q01-older-held.json',older));
 await p.waitForFunction(()=>window.__fileIO.pending.some(x=>x.name==='q01-older-held.json'));
 assert.equal(await p.locator('#workspace-file').inputValue(),'');
 await p.locator('#reload-workspace').click();
 const preview=()=>p.evaluate(()=>({open:document.querySelector('#import-dialog').open,title:document.querySelector('#import-title').textContent,body:document.querySelector('#import-body').textContent,status:document.querySelector('#storage-status').textContent,notice:document.querySelector('#notice').textContent}));
 const selected=await preview();assert.equal(selected.open,true);assert.equal(selected.title,'Arbeitsstand · Importvorschau');
 assert.match(selected.body,/al: 10\.56 · ipl: 8\.64 · tpw: 0\.91 · quantity: 1/);assert.doesNotMatch(selected.body,/777/);
 assert.equal(await p.locator('#al').inputValue(),'123.45');assert.equal(await raw(p),beforeRaw);
 await p.evaluate(()=>window.__fileIO.pending.find(x=>x.name==='q01-older-held.json').release());
 // The original registered async handler has completed; no sleeps/animation-frame drains.
 await p.waitForFunction(()=>window.__fileIO.handlerSettled.includes('q01-older-held.json'));
 const after=await preview();assert.deepEqual(after,selected);assert.equal(await raw(p),beforeRaw);
 assert.equal(await p.locator('#al').inputValue(),'123.45');
 assert.deepEqual(await p.evaluate(()=>window.__fileIO.handlerErrors),[]);
 assert.deepEqual(await p.evaluate(()=>window.__fileIO.completed),['q01-older-held.json']);
 await confirm(p);await assertFields(p,'tardoc',saved.calculators.tardoc);assert.equal(await raw(p),beforeRaw);
 assert.match(await text(p,'#storage-status'),/Ungespeicherter Entwurf/);
 assert.deepEqual((await download(p,'q01-confirmed-saved-draft')).value,saved);
 report.intentRecovery={selected,after,dirtyBefore:dirty,confirmed:saved,rawBefore:beforeRaw,rawAfter:await raw(p),completion:'original DOM change handler returned promise settled',nativeFileText:'original File.prototype.text on selected File, delivered late'};
},{fileIO:true}));

if(listOnly){
 if(selfTest){assert.equal(caseDefs.length,20);assert.equal(caseDefs.at(-1).name.startsWith('Q01 saved recovery:'),true);assert.equal(expectedAmounts.length,8);}
 console.log(JSON.stringify({mode:selfTest?'self-test-offline':'list-only',nativeExecuted:false,node:process.version,python:report.python,privateFixtureAvailable:Boolean(fixture),total:caseDefs.length,cases:caseDefs.map(({name,privateOnly})=>({name,privateOnly})),oracleVectors:vectors.map((v,i)=>({input:v,expected:expectedAmounts[i]}))},null,2));
 process.exit(0);
}
let fatal=null;
try{
 // Fail before browser launch on missing/stale dist. npm run test:browser builds first.
 for(const [dest,source]of Object.entries(runtimeFiles)){
  const built=await readFile(path.join(root,'dist',dest)),input=await readFile(path.join(root,source));assert.deepEqual(built,input,`stale dist/${dest}`);report.runtimeHashes[dest]=sha(built);
 }
 assert(process.env.PLAYWRIGHT_MODULE,'Set PLAYWRIGHT_MODULE to the installed external playwright-core module');
 assert(process.env.BROWSER_EXECUTABLE,'Set BROWSER_EXECUTABLE to the installed Firefox executable');await access(process.env.BROWSER_EXECUTABLE);
 const spec=process.env.PLAYWRIGHT_MODULE;
 const playwright=await import(path.isAbsolute(spec)?pathToFileURL(spec).href:spec);
 assert(playwright.firefox?.launch,'PLAYWRIGHT_MODULE must export firefox.launch');
 server=createAppServer({root:path.join(root,'dist'),basePath});server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;url=origin+basePath;report.url=url;
 browser=await playwright.firefox.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});report.browser={engine:'firefox',version:browser.version(),module:spec,executable:process.env.BROWSER_EXECUTABLE};
 for(const definition of caseDefs){
  currentCase=definition.name;
  if(definition.privateOnly&&!fixture){report.cases.push({name:currentCase,status:'skipped',reason:'Optional private catalog absent; NOT executed, NOT passed'});await checkpoint();continue;}
  const started=Date.now();
  try{await definition.fn();report.cases.push({name:currentCase,status:'passed',durationMs:Date.now()-started});}
  catch(e){report.cases.push({name:currentCase,status:'failed',durationMs:Date.now()-started,error:e.stack||String(e)});}
  await checkpoint();
 }
}catch(e){fatal=e;report.fatal=e.stack||String(e);}
finally{
 for(const c of contexts){try{await c.close();contexts.delete(c);}catch(e){(report.cleanupErrors??=[]).push(String(e));}}
 report.cleanup.contexts=contexts.size===0;
 if(browser){try{await browser.close();report.cleanup.browser=true;}catch(e){(report.cleanupErrors??=[]).push(String(e));}}else report.cleanup.browser='not launched';
 if(server){try{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));report.cleanup.server=!server.listening;}catch(e){(report.cleanupErrors??=[]).push(String(e));}}else report.cleanup.server='not started';
 const recorded=new Set(report.cases.map(c=>c.name));for(const d of caseDefs)if(!recorded.has(d.name))report.cases.push({name:d.name,status:'not-run',reason:'runner setup/cleanup failure; not executed'});
 report.counts=Object.fromEntries(['passed','failed','skipped','not-run'].map(s=>[s,report.cases.filter(c=>c.status===s).length]));report.counts.total=caseDefs.length;
 assert.equal(report.cases.length,caseDefs.length);
 const channelErrors=report.channels.reduce((n,c)=>n+c.errors.length,0);report.channelErrors=channelErrors;
 report.status=!fatal&&!report.counts.failed&&!report.counts['not-run']&&!channelErrors&&!report.cleanupErrors?'passed':'failed';
 await checkpoint();console.log(JSON.stringify({status:report.status,counts:report.counts,node:report.node,browser:report.browser,channelErrors,evidence:run,cleanup:report.cleanup},null,2));if(fatal)console.error(fatal);if(report.status!=='passed')process.exitCode=1;
}
