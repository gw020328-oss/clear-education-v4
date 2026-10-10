import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port=Number(process.env.CLAIM_PORT??4400), root=fileURLToPath(new URL('../claim-ui/',import.meta.url));
const manifestPath=process.env.MANIFEST_PATH, evidencePath=process.env.EVIDENCE_PATH;
const ethersPath=fileURLToPath(new URL('../../node_modules/ethers/dist/ethers.umd.min.js',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'); let file;
  if(req.method==='GET'&&url.pathname==='/manifest.json')file=manifestPath;
  else if(req.method==='GET'&&url.pathname==='/demo-evidence.json')file=evidencePath;
  else if(req.method==='GET'&&url.pathname==='/vendor/ethers.min.js')file=ethersPath;
  else if(req.method==='GET'&&['/','/app.js','/styles.css'].includes(url.pathname))file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
  else {res.writeHead(404,{'Content-Type':'application/json'});return res.end('{"ok":false,"code":"NOT_FOUND"}');}
  const data=await readFile(file);
  const type=url.pathname==='/manifest.json'||url.pathname==='/demo-evidence.json'?'application/json; charset=utf-8':types[extname(file)]??'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(data); process.send?.({type:'request',service:'claim',path:url.pathname});
}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"CLAIM_UI_READ_FAILED"}');}});
server.listen(port,'127.0.0.1',()=>process.send?.({type:'ready',service:'claim',port}));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
