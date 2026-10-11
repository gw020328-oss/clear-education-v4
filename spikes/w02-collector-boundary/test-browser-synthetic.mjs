// Dedicated headless Chrome profiles; loopback-only synthetic source; no personal profile/login.
import { spawn,execFileSync } from 'node:child_process';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root=await fs.mkdtemp(resolve('.toolchain/w02b/browser-'));await fs.chmod(root,0o700);
const issued=new Set(),seen=new Set(),expectedByProfile=new Map();const children=[];let active=0;
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');
 if(/^\/profile\/[12]$/.test(req.url)) {
   const index=req.url.split('/').at(-1);
   const token='SYNTHETIC_'+randomUUID();issued.add(token);expectedByProfile.set(index,token);
   res.setHeader('Set-Cookie',`w02b=${token}; HttpOnly; SameSite=Strict; Path=/`);
   res.end(`<html><body>WAIT<script>fetch('/check/${index}').then(r=>r.text()).then(v=>{document.body.textContent=v})</script></body></html>`);
 } else if(/^\/check\/[12]$/.test(req.url)) {
   const index=req.url.split('/').at(-1);
   const token=(req.headers.cookie??'').replace('w02b=','');if(expectedByProfile.get(index)!==token){res.statusCode=403;res.end('FAIL');return;}
   seen.add(token);res.end('SYNTHETIC_BROWSER_PASS');
 } else {res.statusCode=404;res.end('NOT_FOUND');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const result={scope:'SYNTHETIC_HEADLESS_CHROME_ONLY',chromeVersion:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),checks:[],liveCaptureAllowed:false,attestorConnected:false,osSwapBackupsVerified:false};
async function browser(index) {
 const profile=join(root,'profile-'+index),temp=join(root,'tmp-'+index);await fs.mkdir(profile,{mode:0o700});await fs.mkdir(temp,{mode:0o700});
 const args=['--headless=new','--no-proxy-server','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--disable-extensions','--metrics-recording-only','--password-store=basic','--use-mock-keychain','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,`--disk-cache-dir=${join(profile,'cache')}`,url+'/profile/'+index];
 const child=spawn(chrome,args,{env:{PATH:process.env.PATH,TMPDIR:temp},stdio:['ignore','pipe','pipe']});children.push(child);active++;
 let out='',err='';child.stdout.on('data',b=>{out+=b;});child.stderr.on('data',b=>{err+=b;});
 let exitResolve;const exited=new Promise(r=>{exitResolve=r;});child.once('exit',()=>{active--;exitResolve();});
 const deadline=Date.now()+10000;
 while(!seen.has(expectedByProfile.get(String(index)))) {
   if(Date.now()>=deadline||child.exitCode!==null) throw new Error('SYNTHETIC_BROWSER_SOURCE_TIMEOUT');
   await new Promise(r=>setTimeout(r,25));
 }
 // Source receipt is the measured event. DOM rendering/Chrome auto-exit is not an acceptance criterion.
 child.kill('SIGTERM');const killer=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(killer);
 assert.ok(![...issued].some(token=>out.includes(token)));
 assert.ok(![...issued].some(token=>err.includes(token)));
 const paths=await fs.readdir(profile,{recursive:true});
 return {pid:child.pid,profile,hasCookieDatabase:paths.some(p=>p.endsWith('Cookies')),hasDiskFiles:paths.length>0};
}
try {
 const runs=await Promise.allSettled([browser(1),browser(2)]);
 if(runs.some(r=>r.status==='rejected')) throw runs.find(r=>r.status==='rejected').reason;
 const [a,b]=runs.map(r=>r.value);
 assert.notEqual(a.pid,b.pid);assert.notEqual(a.profile,b.profile);assert.equal(issued.size,2);assert.equal(seen.size,2);
 assert.ok(a.hasCookieDatabase&&b.hasCookieDatabase);result.checks.push('two dedicated Chrome processes and profiles authenticate independently to synthetic loopback HTTP source','synthetic HTTP-only cookies reach their source; no cookie printed to stdout/stderr','both Chrome profiles create disk cookie databases; real collection remains blocked');
 result.profileFindings={profiles:2,cookieDatabases:2,diskFilesPresent:true};
} finally {
 await Promise.all(children.map(child=>{if(child.exitCode!==null||child.signalCode!==null)return;return new Promise(r=>{child.once('exit',r);child.kill('SIGKILL');});}));
 server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});
}
await assert.rejects(()=>fs.stat(root),{code:'ENOENT'});result.checks.push('both synthetic browser profiles and temporary directories removed');result.status='PASS_SYNTHETIC_BROWSER_ISOLATION_DISK_STORAGE_NOT_APPROVED';
if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
