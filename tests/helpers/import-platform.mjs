// QA platform adapter v5: unchanged full app/domain; no product-function replacements.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export const root=process.env.Q01_APP_ROOT?pathToFileURL(path.resolve(process.env.Q01_APP_ROOT)+path.sep):new URL('../../',import.meta.url);
export const source=await readFile(new URL('src/app.js',root),'utf8');
export const reference=JSON.parse(await readFile(new URL('public/data/reference.json',root)));
const profile=JSON.parse(await readFile(new URL('public/data/local-profile.json',root)));
const domainSource=await readFile(new URL('src/domain.js',root),'utf8');
const first=source.slice(0,source.indexOf('\n'));
assert.equal(first,"import {MODES,STORAGE_KEY,calculate,money,validateReference,validateWorkspace,verifyCatalogText,filterRecords,WorkspaceStore} from './domain.js';");
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
export const foreignKeys=['dentotar.workspace.v1','migel.workspace.v1','sl.workspace.v1','analysenliste.workspace.v1','pflegefinanzierung.workspace.v1','arzneimittelliste.workspace.v1','physiotherapie.workspace.v1','spitaltarife.workspace.v1'];
class Node {
 constructor(tag='div',ownerDocument=null){this.ownerDocument=ownerDocument;this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attrs={};this.dataset={};this._text='';this.value='';this.name='';this.open=false;this.hidden=false;this.disabled=false;this.checked=false;this.files=[];this.classList={add(){},remove(){}};}
 get textContent(){return this._text+this.children.map(n=>n.textContent??String(n)).join('');}
 set textContent(s){this._text=String(s);this.children=[];}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this._text='';this.children=[...nodes];if(this.tagName==='SELECT')this.value=nodes[0]?.value??'';}
 addEventListener(type,f){(this.events[type]??=[]).push(f);}
 async emit(type,event={}){for(const f of this.events[type]??[])await f({target:this,preventDefault(){},...event});}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 scrollIntoView(){}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
 querySelector(selector){assert.equal(selector,'button');for(const child of this.children){if(child.tagName==='BUTTON')return child;const found=child.querySelector?.(selector);if(found)return found;}return null;}
 click(){return this.emit('click');}
 remove(){}
}
export async function realm(){
 const ids=new Map();const get=id=>{if(!ids.has(id))ids.set(id,new Node(id==='category'?'select':'div',document));return ids.get(id);};
 const document={body:new Node('body'),activeElement:null,getElementById:get,createElement:t=>new Node(t,document)};
 get('view').value='reference';get('category').value='';
 const map=new Map(),writes=[],events={},trace=[];let readFault=false,digestGate=null;
 const storage={getItem:k=>{if(readFault)throw Error('QA read denied');return map.get(k)??null;},setItem:(k,v)=>{writes.push([k,v]);map.set(k,v);}};

 const window={localStorage:storage,addEventListener:(type,f)=>(events[type]??=[]).push(f),print(){}};
 const crypto={subtle:{digest(...args){
  const native=webcrypto.subtle.digest(...args),gate=digestGate;digestGate=null;
  if(!gate)return native;
  gate.started.resolve();native.then(value=>{gate.native.resolve(value);},e=>gate.native.reject(e));
  return gate.delivery.promise.then(()=>gate.native.promise);
 }}};
 const context=vm.createContext({document,window,Option:function(t,v){const n=new Node('option',document);n.textContent=t;n.value=v;return n;},structuredClone,Blob,URL,TextEncoder,Uint8Array,console,setTimeout,clearTimeout,crypto,fetch:async url=>({ok:true,json:async()=>structuredClone(url==='data/reference.json'?reference:profile)})});
 // Exact domain ESM binds every lexical dependency, including crypto and validation helpers.
 const module=new vm.SourceTextModule(domainSource,{context,identifier:new URL('src/domain.js',root).href});
 await module.link(()=>{throw Error('Unexpected domain import');});await module.evaluate();
 const domain=module.namespace;Object.assign(context,domain);
 const saved=domain.emptyWorkspace(reference);saved.calculators.tardoc={al:'10.56',ipl:'8.64',tpw:'0.91',quantity:'1'};
 const raw='  '+JSON.stringify(saved)+'  ';map.set(domain.STORAGE_KEY,raw);
 const foreign=Object.fromEntries(foreignKeys.map((k,i)=>[k,`  {"sentinel":${i},"literal":"ä / \\n"}  `]));for(const [k,v]of Object.entries(foreign))map.set(k,v);
 // Reuse QUALITY's import-only adapter. vm.Script's completion is the original boot().catch promise.
 const bootPromise=vm.runInContext(source.slice(first.length+1),context,{filename:new URL('src/app.js',root).pathname});
 assert.equal(typeof bootPromise?.then,'function');await bootPromise;
 assert.equal(document.body.dataset.ready,'true');assert.deepEqual(writes,[]);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify({epoch:importEpoch,pending,draft,dirty,catalog:catalog?{positions:catalog.positions.length,contexts:catalog.contexts.length}:null,blocked:store.blocked,baseline:store.baseline})',context));
 const choose=(producer,name='current.json',kind='workspace',size=1000)=>{
  const input=get(kind==='catalog'?'catalog-file':'workspace-file');
  input.files=[{name,size,text:()=>{trace.push(['File.text',name]);return producer();}}];
  const completion=input.emit('change');completion.then(()=>trace.push(['handler settled',name]));return completion;
 };
 const setfile=(textPromise,name)=>choose(()=>textPromise,name);
 const valid=al=>{const v=domain.emptyWorkspace(reference);v.calculators.tardoc={al,ipl:'8.64',tpw:'0.91',quantity:'1'};return v;};
 const held=(kind='workspace')=>{
  const start=deferred(),delivery=deferred(),name=`held-${trace.length}.json`;
  const completion=choose(()=>{start.resolve();return delivery.promise;},name,kind);
  assert.deepEqual(trace.at(-1),['File.text',name],'held reader must reach the actual File.text boundary before awaiting its start');
  return {started:start.promise,completion,name,release:delivery.resolve,reject:delivery.reject};
 };
 const file=async(value,kind='workspace')=>{const bytes=typeof value==='string'?value:JSON.stringify(value);const f=new File([bytes],'selected.json');return choose(()=>f.text(),f.name,kind,f.size);};
 const snapshot=()=>({state:state(),title:get('import-title').textContent,body:get('import-body').textContent,open:get('import-dialog').open,notice:get('notice').textContent,status:get('storage-status').textContent,catalogStatus:get('catalog-status').textContent});
 const intact=()=>{assert.equal(map.get(domain.STORAGE_KEY),raw);assert.deepEqual(writes,[]);assert.deepEqual(Object.fromEntries(foreignKeys.map(k=>[k,map.get(k)])),foreign);};
 const edit=async(al='123.45')=>{get('al').name='al';get('al').value=al;await get('calc-form').emit('input',{target:get('al')});};
 const foreignChange=async raw=>{map.set(domain.STORAGE_KEY,raw);for(const f of events.storage??[])await f({storageArea:storage,key:domain.STORAGE_KEY});};
 const holdDigest=()=>{const gate={started:deferred(),native:deferred(),delivery:deferred()};digestGate=gate;return gate;};
 return {get,state,setfile,choose,valid,saved,raw,writes,map,context,domain,held,file,snapshot,intact,edit,foreignChange,holdDigest,trace,setReadFault:v=>{readFault=v;}};
}
