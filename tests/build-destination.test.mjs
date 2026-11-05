import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,symlink,readlink,lstat,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';
import {runtimeFiles} from '../scripts/files.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'build-destination-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const src of [...Object.values(runtimeFiles),'scripts/source-pins.json']){
  const dest=path.join(root,src);await mkdir(path.dirname(dest),{recursive:true});await cp(path.join(project,src),dest);
 }
 return root;
}
for(const kind of ['file','file symlink','directory symlink','dangling symlink'])test(`build preserves a pre-existing dist ${kind}`,async t=>{
 const root=await fixture(t),dist=path.join(root,'dist'),target=path.join(root,'kept');
 if(kind==='file')await writeFile(dist,'SYNTHETIC irreplaceable output marker');
 else{
  if(kind==='file symlink')await writeFile(target,'SYNTHETIC linked file marker');
  if(kind==='directory symlink'){await mkdir(target);await writeFile(path.join(target,'marker'),'SYNTHETIC directory marker');}
  await symlink('kept',dist);
 }
 await assert.rejects(()=>build(root),/directory|symlink/i,'non-directory destination must be refused, not replaced');
 if(kind==='file')assert.equal(await readFile(dist,'utf8'),'SYNTHETIC irreplaceable output marker');
 else {assert.equal((await lstat(dist)).isSymbolicLink(),true);assert.equal(await readlink(dist),'kept');}
 if(kind==='file symlink')assert.equal(await readFile(target,'utf8'),'SYNTHETIC linked file marker');
 if(kind==='directory symlink')assert.equal(await readFile(path.join(target,'marker'),'utf8'),'SYNTHETIC directory marker');
 assert.ok(!(await readdir(root)).some(n=>n.startsWith('.build-stage-')),'rejection must leave no publication artifacts');
});
test('build still publishes missing and regular-directory destinations',async t=>{
 const root=await fixture(t);await build(root);
 assert.deepEqual((await readdir(path.join(root,'dist'))).sort(),['data','favicon.svg','index.html','src']);
 await writeFile(path.join(root,'dist/index.html'),'SYNTHETIC previous build');await build(root);
 assert.deepEqual(await readFile(path.join(root,'dist/index.html')),await readFile(path.join(root,'index.html')));
});
