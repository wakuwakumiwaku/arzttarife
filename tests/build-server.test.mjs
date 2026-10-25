import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createAppServer} from '../scripts/serve.mjs';
import {build} from '../scripts/build.mjs';
import {runtimeFiles} from '../scripts/files.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'arzttarife-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const source of Object.values(runtimeFiles)){const dest=path.join(root,source);await mkdir(path.dirname(dest),{recursive:true});await cp(path.join(project,source),dest);}
 await mkdir(path.join(root,'scripts'));await cp(path.join(project,'scripts/source-pins.json'),path.join(root,'scripts/source-pins.json'));
 return root;
}
async function inventory(root,prefix=''){const a=[];for(const n of await readdir(root,{withFileTypes:true})){const k=prefix+n.name;if(n.isDirectory())a.push(...await inventory(path.join(root,n.name),k+'/'));else a.push(k);}return a.sort();}
test('build only copies allowlist and validates before replacing last good build',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'public/private'));await writeFile(path.join(root,'public/private/canary.txt'),'NEVER PUBLISH');await mkdir(path.join(root,'sources'));await writeFile(path.join(root,'sources/private.xlsx'),'NEVER PUBLISH');
 await build(root);assert.deepEqual(await inventory(path.join(root,'dist')),Object.keys(runtimeFiles).sort());
 const old=await readFile(path.join(root,'dist/index.html'),'utf8');await writeFile(path.join(root,'public/data/reference.json'),'broken');await assert.rejects(()=>build(root));assert.equal(await readFile(path.join(root,'dist/index.html'),'utf8'),old);
});
test('allowlisted HTTP at Pages subpath; private paths and writes rejected',async t=>{
 const root=await fixture(t);await build(root);
 const server=createAppServer({root:path.join(root,'dist'),basePath:'/arzttarife/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const dest of Object.keys(runtimeFiles)){const r=await fetch(base+'/arzttarife/'+(dest==='index.html'?'':dest));assert.equal(r.status,200);assert.equal(Buffer.from(await r.arrayBuffer()).compare(await readFile(path.join(root,'dist',dest))),0);assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
 for(const p of ['/','/arzttarife/.local/catalog.json','/arzttarife/sources/tardoc.xlsx','/arzttarife/package.json','/arzttarife/public/data/reference.json','/arzttarife/%2e%2e/sources/tardoc.xlsx','/arzttarife/%2fetc/passwd'])assert.equal((await fetch(base+p)).status,404,p);
 assert.equal((await fetch(base+'/arzttarife/',{method:'POST'})).status,405);
 const head=await fetch(base+'/arzttarife/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(base+'/arzttarife/%ZZ')).status,400);
 assert.throws(()=>createAppServer({basePath:'arzttarife/'}));
});
