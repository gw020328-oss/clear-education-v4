import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port=Number(process.env.CLAIM_PORT??0),root=fileURLToPath(new URL('../claim-ui/',import.meta.url)),shared=fileURLToPath(new URL('../shared/',import.meta.url));
const manifestPath=process.env.MANIFEST_PATH,evidencePath=process.env.EVIDENCE_PATH,demoMode=process.env.DEMO_MODE==='1';
const ethersPath=fileURLToPath(new URL('../../node_modules/ethers/dist/ethers.umd.min.js',import.meta.url));
const rpcOrigins=(process.env.RPC_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean);
for(const origin of rpcOrigins){const u=new URL(origin);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('RPC_ORIGIN_NOT_LOOPBACK');}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=createServer(async(req,res)=>{try{
  const expectedHosts=[`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];if(!expectedHosts.includes(req.headers.host)){res.writeHead(421,{'Content-Type':'application/json'});return res.end('{"ok":false,"code":"HOST_REJECTED"}');}
  const url=new URL(req.url,'http://127.0.0.1');let file;
  if(req.method==='GET'&&url.pathname==='/manifest.json')file=manifestPath;
  else if(req.method==='GET'&&url.pathname==='/runtime.json'){res.writeHead(200,headers('application/json; charset=utf-8'));return res.end(JSON.stringify({demoMode,rpcOrigins}));}
  else if(req.method==='GET'&&url.pathname==='/demo-evidence.json'&&demoMode&&evidencePath)file=evidencePath;
  else if(req.method==='GET'&&url.pathname==='/vendor/ethers.min.js')file=ethersPath;
  else if(req.method==='GET'&&url.pathname==='/shared/validation.mjs')file=resolve(shared,'validation.mjs');
  else if(req.method==='GET'&&url.pathname==='/shared/claim-core.mjs')file=resolve(shared,'claim-core.mjs');
  else if(req.method==='GET'&&url.pathname==='/shared/wallet-flow.mjs')file=resolve(shared,'wallet-flow.mjs');
  else if(req.method==='GET'&&demoMode&&['/selftest.html','/selftest.js'].includes(url.pathname))file=resolve(root,url.pathname.slice(1));
  else if(req.method==='GET'&&['/','/app.js','/styles.css','/state.mjs'].includes(url.pathname))file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
  else{res.writeHead(404,{'Content-Type':'application/json'});return res.end('{"ok":false,"code":"NOT_FOUND"}');}
  const data=await readFile(file);res.writeHead(200,headers(url.pathname==='/manifest.json'||url.pathname==='/demo-evidence.json'?'application/json; charset=utf-8':types[extname(file)]??'application/octet-stream'));res.end(data);
}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"CLAIM_UI_READ_FAILED"}');}});
function headers(type){return {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${rpcOrigins.join(' ')}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`};}
server.listen(port,'127.0.0.1',()=>process.send?.({type:'ready',service:'claim',port:server.address().port,demoMode}));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
