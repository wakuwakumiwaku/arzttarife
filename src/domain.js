export const STORAGE_KEY = 'arzttarife.workspace.v1';
export const MODES = Object.freeze({tardoc:'TARDOC',pauschalen:'Ambulante Pauschalen'});
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k=>Object.hasOwn(x,k));
const fail = s => {throw Error(s);};
export function normalize(s) {return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');}
export function scaled(raw, digits, max, label) {
  if(typeof raw!=='string' || !new RegExp(`^(?:0|[1-9][0-9]{0,6})(?:[.,][0-9]{1,${digits}})?$`).test(raw)) fail(`${label}: gültige Dezimalzahl mit höchstens ${digits} Nachkommastellen eingeben.`);
  const [w,f='']=raw.replace(',','.').split('.');
  const value=BigInt(w)*10n**BigInt(digits)+BigInt(f.padEnd(digits,'0'));
  if(value>BigInt(max)*10n**BigInt(digits)) fail(`${label}: Wert ausserhalb des zulässigen Bereichs.`);
  return value;
}
export function quantity(s) {
  if(typeof s!=='string'||!/^[1-9][0-9]{0,5}$/.test(s)||BigInt(s)>100000n) fail('Menge: ganze Zahl von 1 bis 100 000 eingeben.');
  return BigInt(s);
}
export function money(cents) {
  const s=BigInt(cents).toString().padStart(3,'0');
  return `CHF ${s.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'’')}.${s.slice(-2)}`;
}
export function calculate(mode,fields) {
  if(typeof mode!=='string'||!Object.hasOwn(MODES,mode)) fail('Unbekannter Tarifmodus.');
  const tp=mode==='tardoc'?scaled(fields.al,4,1000000,'AL')+scaled(fields.ipl,4,1000000,'IPL'):scaled(fields.points,4,1000000,'Taxpunkte');
  const tpw=scaled(fields.tpw,6,1000,'TPW');
  if(tpw===0n) fail('TPW muss grösser als null sein. Es gibt keinen amtlichen Vorgabewert.');
  const q=quantity(fields.quantity),numerator=tp*tpw*q*100n,denominator=10000n*1000000n;
  return {cents:(numerator+denominator/2n)/denominator,points:tp,quantity:q};
}
export function emptyWorkspace(reference) {
 return {app:'arzttarife.workspace',version:1,edition:reference.edition,mode:'tardoc',calculators:{tardoc:{al:'',ipl:'',tpw:'',quantity:'1'},pauschalen:{points:'',tpw:'',quantity:'1'}},favorites:[]};
}
export function validateWorkspace(v,reference) {
 const e=emptyWorkspace(reference);
 if(!exact(v,Object.keys(e))||v.app!==e.app||v.version!==1||v.edition!==e.edition||typeof v.mode!=='string'||!Object.hasOwn(MODES,v.mode)||!exact(v.calculators,['tardoc','pauschalen'])) fail('Keine passende TARDOC-&-Pauschalen-Sicherung dieser Referenzedition.');
 for(const mode of Object.keys(MODES)) {
  const f=v.calculators[mode],keys=Object.keys(e.calculators[mode]);
  if(!exact(f,keys)) fail('Ungültige Rechnerfelder.');
  for(const k of keys) {
   if(typeof f[k]!=='string') fail('Rechnerwerte müssen Text-Dezimalzahlen sein.');
   if(f[k]==='') continue;
   if(k==='quantity') quantity(f[k]); else scaled(f[k],k==='tpw'?6:4,k==='tpw'?1000:1000000,k);
  }
 }
 const ids=new Set(reference.entries.map(r=>r.id));
 if(!Array.isArray(v.favorites)||v.favorites.length>ids.size||v.favorites.some(id=>typeof id!=='string'||!ids.has(id))||new Set(v.favorites).size!==v.favorites.length) fail('Unbekannte oder doppelte Referenz-Merkeinträge.');
 return structuredClone(v);
}
export function validateReference(r) {
 if(!exact(r,['schemaVersion','edition','asOf','coverage','documents','entries'])||r.schemaVersion!==1||r.edition!=='2026-reference-v1'||!Array.isArray(r.entries)||r.entries.length!==16||!Array.isArray(r.documents)) fail('Ungültige öffentliche Referenz.');
 const docs=new Set();
 for(const d of r.documents) {
  if(!exact(d,['id','title','url','date','dateKind'])||typeof d.id!=='string'||docs.has(d.id)||!safeOfficialUrl(d.url)) fail('Ungültiger Quellverweis.');
  docs.add(d.id);
 }
 const ids=new Set();
 for(const e of r.entries) {
  if(!exact(e,['id','mode','title','category','summary','detail','sources'])||typeof e.id!=='string'||ids.has(e.id)||!['both',...Object.keys(MODES)].includes(e.mode)||['title','category','summary','detail'].some(k=>typeof e[k]!=='string')||!Array.isArray(e.sources)||!e.sources.length||e.sources.some(id=>!docs.has(id))) fail('Ungültiger Referenzeintrag.');
  ids.add(e.id);
 }
 return r;
}
export function safeOfficialUrl(url) {
 try {const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&['oaat-otma.ch','tarifbrowser.oaat-otma.ch'].includes(u.hostname);}catch{return false;}
}
export function validateLocalCatalog(c,profile) {
 if(!exact(c,['app','version','edition','sources','positions','contexts'])||c.app!==profile.app||c.version!==1||c.edition!==profile.edition||JSON.stringify(c.sources)!==JSON.stringify(profile.sources)||!Array.isArray(c.positions)||c.positions.length!==1702||!Array.isArray(c.contexts)||c.contexts.length!==profile.contexts) fail('Lokaler Katalog passt nicht zur gepinnten 2026-Version.');
 const ids=new Set(),counts={tardoc:0,pauschalen:0};
 const str=(s,max=100000)=>typeof s==='string'&&s.length<=max;
 for(const p of c.positions) {
  if(!exact(p,['id','mode','code','title','interpretation','amounts','chapter','parent','fields','source'])||typeof p.mode!=='string'||!Object.hasOwn(MODES,p.mode)||!str(p.code,32)||!(p.mode==='tardoc'?/^[A-Z]{2}\.[0-9]{2}\.[0-9]{4}$/:/^C[0-9]{2}\.[0-9]{2}[A-Z]$/).test(p.code)||p.id!==p.mode+':'+p.code||ids.has(p.id)||!str(p.title)||!p.title||!str(p.interpretation)||!str(p.chapter)||!str(p.parent)||!exact(p.amounts,p.mode==='tardoc'?['al','ipl']:['points'])) fail('Ungültige lokale Tarifposition.');
  for(const a of Object.values(p.amounts)) {
   if(!object(a)||!str(a.raw)||!['numeric','open','missing'].includes(a.kind)||!exact(a,a.kind==='numeric'?['kind','decimal','raw']:['kind','raw'])) fail('Ungültiger Punktwerttyp.');
   if(a.kind==='numeric') {if(!/^[0-9]+\.[0-9]{2}$/.test(a.decimal)) fail('Ungültige Punktdezimalzahl.');scaled(a.decimal,4,1000000,'Katalogwert');}
   if(a.kind==='missing'&&a.raw!=='') fail('Leere Zelle inkonsistent.');
  }
  if(!Array.isArray(p.fields)||p.fields.length>30||p.fields.some(f=>!exact(f,['name','text'])||!str(f.name,200)||!str(f.text))||!exact(p.source,['id','sheet','row'])||p.source.id!==p.mode||!str(p.source.sheet,100)||!Number.isSafeInteger(p.source.row)||p.source.row<1) fail('Ungültige Detailfelder.');
  ids.add(p.id);counts[p.mode]++;
 }
 if(Object.keys(counts).some(k=>counts[k]!==profile.counts[k])) fail('Unvollständiger lokaler Katalog.');
 const contextIds=new Set();
 for(const t of c.contexts) {
  if(!exact(t,['id','mode','sheet','rows'])||typeof t.mode!=='string'||!Object.hasOwn(MODES,t.mode)||!str(t.sheet,100)||t.id!==t.mode+':'+t.sheet||contextIds.has(t.id)||!Array.isArray(t.rows)||t.rows.length>2000) fail('Ungültige Begleittabelle.');
  const rows=new Set();
  for(const r of t.rows) {if(!exact(r,['row','cells'])||!Number.isSafeInteger(r.row)||r.row<1||rows.has(r.row)||!object(r.cells)||Object.keys(r.cells).length>30||Object.entries(r.cells).some(([k,v])=>!/^[A-Z]{1,2}$/.test(k)||!str(v))) fail('Ungültige Begleitzeile.');rows.add(r.row);}
  contextIds.add(t.id);
 }
 return c;
}
export async function verifyCatalogText(text,profile) {
 const b=new TextEncoder().encode(text);
 if(b.length!==profile.bytes) fail('Dateigrösse passt nicht zum offiziellen lokalen Konverter.');
 const digest=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==profile.sha256) fail('SHA256 stimmt nicht mit dem reproduzierbaren lokalen Konverter überein. Keine Datei übernommen.');
 return validateLocalCatalog(JSON.parse(text),profile);
}
export function filterRecords(records,{mode,query='',category='',favoritesOnly=false,favorites=[]}) {
 const words=normalize(query).trim().split(/\s+/).filter(Boolean),saved=new Set(favorites);
 return records.filter(r=>(r.mode===mode||r.mode==='both')&&(!category||(r.category||r.chapter)===category)&&(!favoritesOnly||saved.has(r.id))&&words.every(w=>normalize([r.id,r.code,r.title,r.summary,r.detail,r.interpretation,...(r.fields||[]).map(f=>f.text)].filter(Boolean).join(' ')).includes(w)));
}
export class WorkspaceStore {
 constructor(storage,reference) {
  this.storage=storage;this.reference=reference;this.baseline=null;this.blocked=false;this.reason='';this.value=emptyWorkspace(reference);
  try{this.baseline=storage.getItem(STORAGE_KEY);if(this.baseline!==null)this.value=validateWorkspace(JSON.parse(this.baseline),reference);}catch{this.block('Lokaler Speicher ist beschädigt oder gesperrt. Bestehende Daten werden nicht überschrieben.');}
 }
 block(reason){this.blocked=true;this.reason=reason;}
 foreign(raw){if(raw!==this.baseline)this.block('Fremdänderung erkannt. Ihr Entwurf bleibt erhalten; bitte zuerst als JSON sichern und die gespeicherte Fassung bewusst neu laden.');}
 save(value){
  if(this.blocked) fail(this.reason);
  const safe=validateWorkspace(value,this.reference);
  try {
   if(this.storage.getItem(STORAGE_KEY)!==this.baseline){this.foreign(this.storage.getItem(STORAGE_KEY));fail(this.reason);}
   const text=JSON.stringify(safe);this.storage.setItem(STORAGE_KEY,text);
   if(this.storage.getItem(STORAGE_KEY)!==text){this.block('Speichern wurde durch eine Fremdänderung unterbrochen.');fail(this.reason);}
   this.baseline=text;this.value=safe;return true;
  } catch(e){this.block(this.reason||'Speicher nicht beschreibbar. Entwurf bleibt unverändert; JSON-Sicherung verwenden.');throw Error(this.reason,{cause:e});}
 }
}
