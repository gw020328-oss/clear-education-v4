import fs from 'node:fs';
import http from 'node:http';
import {resolve} from 'node:path';
import {root,project,encode} from '../lib/io.mjs';
export async function jsonBody(req){let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>64000)throw Error('BODY_LIMIT');}return JSON.parse(s||'{}');}
export function send(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(encode(value));}
export function staticFile(path){const map={'/':'app/index.html','/app.js':'app/app.js','/style.css':'app/style.css','/refinements.css':'app/refinements.css','/manifest.webmanifest':'app/manifest.webmanifest','/product.mjs':'policy/product.mjs','/recovery.js':'recovery/app.js'};
 if(path==='/ethers.mjs')return {content:fs.readFileSync(resolve(project,'node_modules/ethers/dist/ethers.min.js')),type:'text/javascript'};
 if(path==='/runtime-v3.mjs')return {content:fs.readFileSync(resolve(project,'stage15/shared/runtime.mjs')),type:'text/javascript'};
 if(path==='/validation.mjs')return {content:fs.readFileSync(resolve(project,'stage6/shared/validation.mjs')),type:'text/javascript'};
 if(path==='/binding-core.mjs'){let s=fs.readFileSync(resolve(project,'stage15/policy/core.mjs'),'utf8');s=s.replace("import {createHash} from 'node:crypto';",'').replaceAll("from 'ethers'","from '/ethers.mjs'").replace("from '../../stage6/shared/validation.mjs'","from '/validation.mjs'").replaceAll('Buffer.byteLength(s)','new TextEncoder().encode(s).length').replaceAll('Buffer.byteLength(text)','new TextEncoder().encode(text).length').replace("'0x'+createHash('sha256').update(text,'utf8').digest('hex')","ethers.sha256(toUtf8Bytes(text))");return {content:s,type:'text/javascript'};}
 const f=map[path];if(!f)return null;return {content:fs.readFileSync(resolve(root,f)),type:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.webmanifest')?'application/manifest+json':'text/javascript'};
}
export async function server(handler,{allowedOrigin=()=>null}={}){const s=http.createServer(async(req,res)=>{const origin=`http://127.0.0.1:${s.address().port}`;
 if(req.headers.host!==`127.0.0.1:${s.address().port}`){res.writeHead(403).end();return;}
 if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!==allowedOrigin()){res.writeHead(403).end();return;}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 try{await handler(req,res);}catch(e){send(res,{error:/^[A-Z_]+$/.test(e.code??e.message)?e.code??e.message:'REQUEST_FAILED'},400);}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));return s;
}
export function serve(res,file,rpc=''){if(!file){res.writeHead(404).end();return;}res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${rpc}; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store'});res.end(file.content);}
