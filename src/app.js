import {MODES,STORAGE_KEY,calculate,money,validateReference,validateWorkspace,verifyCatalogText,filterRecords,WorkspaceStore} from './domain.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
let reference,profile,store,draft,catalog=null,dirty=false,visible=30,records=[],filtered=[],contextRecords=[],pending=null,importEpoch=0;
let calcOrigin='Eigene Eingaben; keine Fallzuordnung.';
const docLink=(id)=>{const d=reference.documents.find(d=>d.id===id);const a=el('a',d.title);a.href=d.url;return a;};
function notice(text){$('notice').textContent=text;$('notice').hidden=false;}
function markDirty(){dirty=true;paintStorage();}
function paintStorage(){
 $('storage-status').textContent=store.blocked?store.reason:dirty?'Ungespeicherter Entwurf. Nur „Lokal speichern“ verändert den Browser-Speicher.':store.baseline===null?'Noch kein Arbeitsstand gespeichert.':'Gespeicherter Arbeitsstand geladen.';
 $('storage-status').className=store.blocked?'warning small':'small muted';$('save').disabled=store.blocked;
}
function drawCalculator(){
 const mode=draft.mode,f=draft.calculators[mode];
 $('tardoc-fields').hidden=mode!=='tardoc';$('pauschalen-fields').hidden=mode!=='pauschalen';
 for(const k of Object.keys(f))$(k).value=f[k];
 $('formula').textContent=mode==='tardoc'?'(AL + IPL) × TPW × Menge':'Pauschalen-Taxpunkte × TPW × Menge';
 $('calc-origin').textContent=calcOrigin;paintCalculation();
}
function paintCalculation(){
 try{const c=calculate(draft.mode,draft.calculators[draft.mode]);$('amount').textContent=money(c.cents);$('calc-message').textContent='Rechnerischer Szenariobetrag, auf 0.01 CHF gerundet. Keine Abrechnungsfreigabe.';$('amount').classList.remove('unresolved');}
 catch(e){$('amount').textContent='Kein berechenbarer Betrag';$('amount').classList.add('unresolved');$('calc-message').textContent=e.message;}
}
function setMode(mode,mark=true){
 if(draft.mode!==mode){draft.mode=mode;calcOrigin='Eigene Eingaben; keine Fallzuordnung.';if(mark)markDirty();}
 for(const key of Object.keys(MODES))$('mode-'+key).setAttribute('aria-pressed',String(key===mode));
 drawCalculator();populateCategories();renderResults();
}
function currentRecords(){const v=$('view').value;return v==='reference'?reference.entries:v==='positions'?(catalog?.positions||[]):contextRecords;}
function populateCategories(){
 records=currentRecords();$('category').replaceChildren(new Option('Alle Bereiche',''));
 const cats=[...new Set(records.filter(r=>r.mode===draft.mode||r.mode==='both').map(r=>r.category||r.chapter).filter(Boolean))];
 for(const c of cats)$('category').append(new Option(c,c));
 $('favorites-only').disabled=$('view').value!=='reference';if($('favorites-only').disabled)$('favorites-only').checked=false;
}
function renderResults(reset=true){
 if(reset)visible=30;
 const v=$('view').value,isRef=v==='reference';
 $('browser-title').textContent=isRef?'Referenz durchsuchen':v==='positions'?'Lokale Tarifpositionen':'Lokale Begleittabellen';
 $('corpus').textContent=isRef?'Eigene Zusammenfassungen':catalog?'Nur in diesem Tab':'Katalog nicht geladen';
 $('results').replaceChildren();
 if(!isRef&&!catalog){$('count').textContent='Kein lokaler Katalog geladen.';const p=el('p','Der öffentliche Umfang enthält keine Tarifpositionen. Vollständige Originale nach Prüfung der eigenen Nutzungsbefugnis lokal öffnen.','empty');const a=el('a','Zur Importanleitung');a.href='#local-catalog';p.append(el('br'),a);$('results').append(p);$('more').hidden=true;return;}
 filtered=filterRecords(records,{mode:draft.mode,query:$('search').value,category:$('category').value,favoritesOnly:$('favorites-only').checked,favorites:draft.favorites});
 $('count').textContent=`${filtered.length} Treffer · ${Math.min(visible,filtered.length)} angezeigt`;
 if(!filtered.length)$('results').append(el('p','Keine Treffer. Suchbegriff, Bereich oder Merkliste zurücksetzen.','empty'));
 for(const r of filtered.slice(0,visible)){
  const card=el('article',undefined,'result');card.dataset.id=r.id;
  const h=el('h3');const b=el('button',(r.code?r.code+' · ':'')+r.title,'detail-link');b.type='button';b.addEventListener('click',()=>openDetail(r));h.append(b);card.append(h);
  if(isRef)card.append(el('p',r.summary));
  else if(v==='positions')card.append(el('p',pointSummary(r),'points'));
  else card.append(el('p',r.summary,'context-preview'));
  const foot=el('div',undefined,'result-footer');foot.append(el('span',r.category||r.chapter||MODES[r.mode],'small muted'));
  if(isRef){const saved=draft.favorites.includes(r.id),star=el('button',saved?'Gemerkt':'Merken','quiet');star.type='button';star.setAttribute('aria-pressed',String(saved));star.setAttribute('aria-label',`${saved?'Merkeintrag entfernen':'Referenz merken'}: ${r.title}`);star.addEventListener('click',()=>{draft.favorites=saved?draft.favorites.filter(i=>i!==r.id):[...draft.favorites,r.id];markDirty();renderResults(false);});foot.append(star);}
  else if(v==='positions'){const use=el('button','Punkte in Rechner');use.type='button';use.addEventListener('click',()=>usePosition(r));foot.append(use);}
  card.append(foot);$('results').append(card);
 }
 $('more').hidden=visible>=filtered.length;
}
function pointSummary(p){return Object.entries(p.amounts).map(([k,v])=>`${k==='points'?'TP':k.toUpperCase()}: ${v.kind==='numeric'?v.decimal:v.kind==='missing'?'fehlend (leere Quellzelle)':'offen · '+v.raw}`).join(' · ');}
function detailField(container,label,text){container.append(el('h3',label),el('p',text||'Leere Quellzelle.','prewrap'));}
function openDetail(r){
 const body=$('detail-body');body.replaceChildren();$('detail-title').textContent=(r.code?r.code+' · ':'')+r.title;
 if($('view').value==='reference'){
  detailField(body,'Kurzreferenz',r.summary);detailField(body,'Anwendung und Grenze',r.detail);
  const list=el('ul');for(const id of r.sources){const li=el('li');li.append(docLink(id));list.append(li);}body.append(el('h3','Offizielle Quellen'),list);
 }else if($('view').value==='positions'){
  body.append(el('p',pointSummary(r),'points'));
  detailField(body,'Original: Interpretation / Hinweis',r.interpretation);
  for(const [k,a]of Object.entries(r.amounts))detailField(body,`${k==='points'?'Taxpunkte':k.toUpperCase()} · Originalzelle (${a.kind})`,a.raw);
  body.append(el('p','Rechenbasis des Imports: Einzelkomponenten auf 2 Nachkommastellen kaufmännisch gerundet; Rohwerte oben unverändert.','small warning'));
  for(const f of r.fields)detailField(body,'Originalfeld: '+f.name,f.text);
  detailField(body,'Quellstelle',`${r.source.sheet} · Excel-Zeile ${r.source.row} · ${profile.edition}`);
  const a=docLink(r.mode);body.append(a,el('p','Für Definitionen und Kapitelinterpretationen auch den Inhalt „Begleittabellen“ durchsuchen. Keine automatische Regelauswertung.'));
  const b=el('button','Punkte in Rechner übernehmen','primary');b.type='button';b.addEventListener('click',()=>{usePosition(r);$('detail-dialog').close();});body.append(b);
 }else{
  for(const f of r.fields)detailField(body,'Originalspalte '+f.name,f.text);
  body.append(docLink(r.mode));
 }
 $('detail-dialog').showModal();
}
function usePosition(p){
 const mode=p.mode;draft.mode=mode;const f=draft.calculators[mode];
 for(const [k,a]of Object.entries(p.amounts))f[k]=a.kind==='numeric'?a.decimal:'';
 f.quantity='1';calcOrigin=`Lokal importiert: ${p.code}. Gerundete Einzelkomponenten; Original und Regeln in den Details prüfen.`;
 setMode(mode,false);markDirty();$('calc-origin').textContent=calcOrigin;
 $('calculator').scrollIntoView({block:'start',behavior:'smooth'});notice('Punkte übernommen. TPW selbst eingeben; offene Werte bleiben leer.');
}
function updateContexts(){
 contextRecords=(catalog?.contexts||[]).flatMap(t=>t.rows.map(r=>({id:`${t.id}:${r.row}`,mode:t.mode,title:`${t.sheet} · Zeile ${r.row}`,category:t.sheet,summary:Object.values(r.cells).join(' · '),fields:Object.entries(r.cells).map(([name,text])=>({name,text}))})));
}
function activateCatalog(c){catalog=c;updateContexts();$('catalog-status').textContent='Vollständig lokal geladen: 1 388 TARDOC-Positionen, 314 Pauschalen und 9 Begleittabellen. Keine Regelauswertung. Beim Neuladen wird der Katalog entfernt.';$('unload-catalog').disabled=false;$('view').value='positions';$('search').value='';populateCategories();renderResults();}
function cancelImport(){importEpoch++;pending=null;if($('import-dialog').open)$('import-dialog').close();}
function preview(kind,value){
 pending={kind,value};$('import-title').textContent=kind==='catalog'?'Lokaler Katalog · Importvorschau':'Arbeitsstand · Importvorschau';$('import-body').replaceChildren();
 if(kind==='catalog'){$('import-body').append(el('p','Geprüfter Hash und vollständiges Schema: 1 702 Positionen, davon 1 388 TARDOC und 314 Pauschalen; neun Begleittabellen. Quellen: TARDOC 1.4c_260402 und Pauschalen 1.1c. Ausschliesslich im Arbeitsspeicher.'),el('p','Erst „Übernehmen“ ersetzt einen eventuell geöffneten lokalen Katalog. Die Arbeitsstand-Sicherung wird nicht verändert.'));
 }else{
  const list=el('dl');for(const [m,f]of Object.entries(value.calculators)){list.append(el('dt',MODES[m]),el('dd',Object.entries(f).map(([k,v])=>`${k}: ${v||'leer'}`).join(' · ')));}
  $('import-body').append(el('p',`Modus: ${MODES[value.mode]} · ${value.favorites.length} gemerkte Referenzen · Edition ${value.edition}`),list,el('p','Übernehmen ersetzt nur den ungespeicherten Entwurf. Bestehender Browser-Speicher bleibt unverändert bis „Lokal speichern“.'));
 }
 $('import-dialog').showModal();
}
async function readImport(input,kind){
 const token=++importEpoch,file=input.files?.[0];input.value='';if(!file)return;
 try{
  if(file.size>(kind==='catalog'?8_000_000:40_000))throw Error('Datei zu gross.');
  const text=await file.text();const value=kind==='catalog'?await verifyCatalogText(text,profile):validateWorkspace(JSON.parse(text),reference);
  if(token!==importEpoch)return;
  preview(kind,value);
 }catch(e){if(token===importEpoch){const message='Nicht geöffnet: '+e.message;$(kind==='catalog'?'catalog-status':'storage-status').textContent=message;notice(message);}}
}
function download(){
 try{const safe=validateWorkspace(draft,reference),blob=new Blob([JSON.stringify(safe,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='arzttarife-arbeitsstand.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('JSON-Sicherung enthält nur Rechnerfelder und Referenz-Merkliste, keinen lokalen Katalog.');}catch(e){notice('Sicherung nicht möglich: '+e.message);}
}
async function boot(){
 const load=async url=>{const r=await fetch(url);if(!r.ok)throw Error('Referenzdaten nicht erreichbar ('+r.status+').');return r.json();};
 [reference,profile]=await Promise.all([load('data/reference.json'),load('data/local-profile.json')]);validateReference(reference);
 let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('storage denied');}};}
 store=new WorkspaceStore(storage,reference);draft=structuredClone(store.value);
 for(const mode of Object.keys(MODES))$('mode-'+mode).addEventListener('click',()=>setMode(mode));
 for(const id of ['search','category','favorites-only'])$(id).addEventListener(id==='search'?'input':'change',()=>renderResults());
 $('view').addEventListener('change',()=>{populateCategories();renderResults();});
 $('reset').addEventListener('click',()=>{$('search').value='';$('category').value='';$('favorites-only').checked=false;renderResults();$('search').focus();});
 $('more').addEventListener('click',()=>{const before=Math.min(visible,filtered.length);visible+=30;renderResults(false);$('results').children[before]?.querySelector('button')?.focus();});
 $('calc-form').addEventListener('input',e=>{const k=e.target.name;if(Object.hasOwn(draft.calculators[draft.mode],k)){draft.calculators[draft.mode][k]=e.target.value;calcOrigin='Eigene Eingaben; keine Fallzuordnung.';$('calc-origin').textContent=calcOrigin;markDirty();paintCalculation();}});
 $('calc-form').addEventListener('submit',e=>{e.preventDefault();paintCalculation();});
 $('save').addEventListener('click',()=>{try{store.save(draft);dirty=false;paintStorage();notice('Arbeitsstand lokal gespeichert.');}catch(e){paintStorage();$('storage-status').textContent=e.message;notice(e.message);}});
 $('export').addEventListener('click',download);
 $('open-workspace').addEventListener('click',()=>$('workspace-file').click());$('workspace-file').addEventListener('change',()=>readImport($('workspace-file'),'workspace'));
 $('open-catalog').addEventListener('click',()=>$('catalog-file').click());$('catalog-file').addEventListener('change',()=>readImport($('catalog-file'),'catalog'));
 $('confirm-import').addEventListener('click',()=>{if(!pending)return;const p=pending;cancelImport();if(p.kind==='catalog')activateCatalog(p.value);else{draft=structuredClone(p.value);calcOrigin='Eigene Eingaben aus JSON-Sicherung; keine Fallzuordnung.';markDirty();setMode(draft.mode,false);notice('Arbeitsstand als ungespeicherten Entwurf übernommen.');}});
 $('cancel-import').addEventListener('click',cancelImport);$('import-dialog').addEventListener('cancel',cancelImport);
 $('unload-catalog').addEventListener('click',()=>{cancelImport();catalog=null;contextRecords=[];$('view').value='reference';$('catalog-status').textContent='Kein lokaler Katalog geladen.';$('unload-catalog').disabled=true;populateCategories();renderResults();notice('Katalog aus dem Arbeitsspeicher entfernt. Rechnerfelder bleiben eigene Eingaben.');});
 $('reload-workspace').addEventListener('click',()=>{cancelImport();try{const candidate=new WorkspaceStore(storage,reference);if(candidate.blocked)throw Error(candidate.reason);preview('workspace',candidate.value);notice('Gespeicherte Fassung als Vorschau geöffnet. Zum Aufheben einer Konfliktsperre nach JSON-Sicherung diese Seite neu laden.');}catch(e){notice(e.message);}});
 window.addEventListener('storage',e=>{if(e.storageArea===storage&&(e.key===STORAGE_KEY||e.key===null)){try{store.foreign(storage.getItem(STORAGE_KEY));}catch{store.block('Speicherzugriff gesperrt. Ihr Entwurf bleibt erhalten; JSON sichern.');}paintStorage();}});
 $('close-detail').addEventListener('click',()=>$('detail-dialog').close());$('print').addEventListener('click',()=>window.print());
 for(const d of reference.documents){const card=el('p');card.append(docLink(d.id),el('br'),el('span',`${d.dateKind}: ${d.date}`,'small muted'));$('sources').append(card);}
 setMode(draft.mode,false);paintStorage();$('application').hidden=false;document.body.dataset.ready='true';
}
boot().catch(e=>{$('fatal').textContent='Die Anwendung konnte nicht aktiviert werden: '+e.message+' Keine Ersatzdaten geladen. Bitte über den lokalen Server oder die Projektseite öffnen.';$('fatal').hidden=false;});
