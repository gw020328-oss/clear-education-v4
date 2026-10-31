// Invented HTTPS origin for an explicit isolated rehearsal only. Never used by --live-hackerrank.
// Keep canonical HackerRank URL/SNI and certificate verification; redirect TCP in this child only.
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import net from 'node:net';
export async function startSyntheticHttps(){
 const directory=mkdtempSync(join(tmpdir(),'clear-synthetic-https-'));
 const openssl=args=>execFileSync('/usr/bin/openssl',args,{cwd:directory,stdio:'ignore'});
 let server,original;const sockets=new Set();
 const close=async()=>{if(original)net.Socket.prototype.connect=original;for(const s of sockets)s.destroy();if(server)await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true});};
 try{
  openssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','1','-subj','/CN=CLEAR Synthetic Test CA']);
  openssl(['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=www.hackerrank.com']);
  writeFileSync(join(directory,'ext.cnf'),'subjectAltName=DNS:www.hackerrank.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl(['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','1','-extfile','ext.cnf']);
  const ca=readFileSync(join(directory,'ca.pem'),'utf8');(globalThis.TLS_ADDITIONAL_ROOT_CA_LIST??=[]).push(ca);
  const username='synthetic-orchid',profile={username,email:'invented@example.invalid'};
  const account='<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{prefetchedData:{profile},dehydrateState:{queries:[{queryKey:['prefetchData'],state:{data:{profile}}}]}}}})+'</script></body></html>';
  const certificate=JSON.stringify({data:[{id:'synthetic-python-orchid',attributes:{username,status:'test_passed',test_unique_id:'synthetic-python-test',certificate:{label:'Python',level:'Basic',track_slug:'python_basic',unique_id:'synthetic-python-basic'}}}]});
  server=createServer({key:readFileSync(join(directory,'server.key')),cert:readFileSync(join(directory,'server.pem')),minVersion:'TLSv1.2',maxVersion:'TLSv1.2'},(req,res)=>{
   const role=req.url==='/dashboard'?'account':req.url==='/community/v1/test_results/hacker_certificate?username='+username?'certificate':null;
   if(req.method!=='GET'||req.headers.host!=='www.hackerrank.com'||req.headers.cookie!=='session=SYNTHETIC_ONLY'||!role){res.writeHead(403);res.end();return;}
   const body=role==='account'?account:certificate;res.writeHead(200,{'Content-Type':role==='account'?'text/html':'application/json','Content-Length':Buffer.byteLength(body),'Connection':'close'});res.end(body);
  });server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;
  process.env.ALLOWED_DIRECT_HOSTS='www.hackerrank.com';
  original=net.Socket.prototype.connect;
  net.Socket.prototype.connect=function(options,...args){
   if(options&&typeof options==='object'&&options.host==='www.hackerrank.com'&&Number(options.port)===443)return original.call(this,{...options,host:'127.0.0.1',port},...args);
   // Rehearsal server never opens arbitrary outbound sockets.
   throw Error('SYNTHETIC_OUTBOUND_BLOCKED');
  };
  return {ca,close};
 }catch{await close();throw Error('SYNTHETIC_HTTPS_START');}
}
