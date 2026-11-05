import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {createAppServer} from '../scripts/serve.mjs';
function request(server,host,method='GET'){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/arzttarife/',method,setHost:false,headers:{Host:host},agent:false},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));
    });req.setTimeout(5000,()=>req.destroy(new Error('Synthetic HTTP request timed out')));req.on('error',reject);req.end();
  });
}
for(const host of ['attacker.invalid','attacker.invalid:3011','127.0.0.1.attacker.invalid','localhost.attacker.invalid','user@localhost','localhost/path','localhost:65536','localhost:0','localhost:-1','localhost:abc',''])test(`local server refuses non-local authority ${host}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'arzt-host-'));let server;
  try{
    const body='<h1>Synthetic local-only runtime</h1>';await writeFile(join(root,'index.html'),body);
    server=createAppServer({root,basePath:'/arzttarife/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    for(const method of ['GET','HEAD']){
      const response=await request(server,host,method);
      assert.ok([400,403].includes(response.status),`${method} must reject ${host}, got ${response.status}`);
      assert.notEqual(response.body,body);
    }
    for(const allowed of ['localhost','LOCALHOST:3011','127.0.0.1',`127.0.0.1:${server.address().port}`,'[::1]','[::1]:3011','localhost:1','localhost:65535']){
      for(const method of ['GET','HEAD']){const response=await request(server,allowed,method);assert.equal(response.status,200,allowed);assert.equal(response.body,method==='GET'?body:'');}
    }
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(root,{recursive:true,force:true});}
});
