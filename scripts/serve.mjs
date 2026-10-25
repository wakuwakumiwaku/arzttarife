import http from 'node:http';
import {readFile,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeFiles} from './files.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function createAppServer({root=path.join(project,'dist'),basePath='/'}={}){
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath))throw Error('basePath must be a simple absolute directory path ending in /.');
 return http.createServer(async(req,res)=>{
  const send=(code,text)=>{res.writeHead(code,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:text);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');send(405,'Method not allowed');return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{send(400,'Bad URL');return;}
  if(!pathname.startsWith(basePath)){send(404,'Not found');return;}
  const relative=pathname.slice(basePath.length)||'index.html';
  if(!Object.hasOwn(runtimeFiles,relative)){send(404,'Not found');return;}
  try{
   const resolvedRoot=await realpath(root),file=path.join(root,relative);
   let step=root;for(const part of relative.split('/')){step=path.join(step,part);if((await lstat(step)).isSymbolicLink()){send(404,'Not found');return;}}
   const target=await realpath(file);
   if(!target.startsWith(resolvedRoot+path.sep)||!(await lstat(target)).isFile()){send(404,'Not found');return;}
   const content=await readFile(target);
   res.writeHead(200,{'content-type':types[path.extname(relative)]||'application/octet-stream','content-length':content.length,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
  }catch{send(404,'Not found');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number(process.env.PORT||3011),basePath=process.env.BASE_PATH||'/';if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 createAppServer({basePath}).listen(port,'127.0.0.1',()=>console.log(`Arzttarife: http://127.0.0.1:${port}${basePath}`));
}
