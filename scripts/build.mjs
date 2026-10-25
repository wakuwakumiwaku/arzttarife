import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validatedInputs} from './check.mjs';
export async function build(root=fileURLToPath(new URL('../',import.meta.url))){
 // All inputs read and validated before any replacement of last good output.
 const buffers=await validatedInputs(root);
 const stage=path.join(root,`.build-stage-${process.pid}-${Date.now()}`),old=stage+'-old',out=path.join(root,'dist');
 let backed=false;
 try{
  await mkdir(stage);
  for(const [dest,content]of buffers){const file=path.join(stage,dest);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content);}
  try{await rename(out,old);backed=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await rename(stage,out);}catch(e){if(backed)await rename(old,out);backed=false;throw e;}
  if(backed)await rm(old,{recursive:true,force:true});
  console.log(`Built ${buffers.size} allowlisted runtime files. No originals or private catalog copied.`);
 }finally{await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await build();
