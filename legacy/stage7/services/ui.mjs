import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const cfg=JSON.parse(process.env.UI_CONFIG),root=new URL('../ui/',import.meta.url);
const shared=new URL('../../stage6/shared/',import.meta.url);
const files={'/':new URL('index.html',root),'/app.mjs':new URL('app.mjs',root),'/style.css':new URL('style.css',root),'/vendor/ethers.js':new URL('../../node_modules/ethers/dist/ethers.umd.min.js',import.meta.url)};
for(const n of ['validation.mjs','claim-core.mjs','wallet-flow.mjs'])files['/shared/'+n]=new URL(n,shared);
const origin=new URL(cfg.endpoint).origin;
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('LOCAL_ONLY');
const server=createServer(async(req,res)=>{try{
  if(![`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`].includes(req.headers.host)){res.writeHead(421);return res.end();}
  const path=new URL(req.url,'http://localhost').pathname;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`};
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(path==='/config.json'){res.writeHead(200,{...headers,'Content-Type':'application/json'});return res.end(JSON.stringify(cfg));}
  if(path==='/manifest.json'||(path==='/demo-evidence.json'&&cfg.demoMode)){
    res.writeHead(200,{...headers,'Content-Type':'application/json'});return res.end(await readFile(path==='/manifest.json'?process.env.MANIFEST_PATH:process.env.EVIDENCE_PATH));
  }
  if(!files[path]){res.writeHead(404);return res.end();}
  res.writeHead(200,{...headers,'Content-Type':path==='/'?'text/html; charset=utf-8':path.endsWith('.css')?'text/css':'text/javascript'});res.end(await readFile(files[path]));
}catch{res.writeHead(500);res.end('UI_READ_FAILED');}});
server.listen(0,'127.0.0.1',()=>{const ready={type:'ready',port:server.address().port};if(process.send)process.send(ready);else console.log(JSON.stringify(ready));});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
