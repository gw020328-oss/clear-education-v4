import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { CentralEscrow } from '../lib/central.mjs';
import { parseEvidenceText } from '../../stage6/lib/evidence.mjs';
process.umask(0o077);
const manifest=JSON.parse(readFileSync(process.env.MANIFEST_PATH,'utf8'));
const escrow=new CentralEscrow(process.env.LEDGER_PATH,manifest);
// Independent fixed test clock: no chain RPC, request-supplied timestamp or school API.
const now=()=>Number(readFileSync(process.env.CLOCK_PATH,'utf8'));
const origins=new Set(JSON.parse(process.env.UI_ORIGINS||'[]'));
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
  if(![`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`].includes(req.headers.host))return send(res,421,{code:'HOST_REJECTED'});
  if(req.headers.origin){if(!origins.has(req.headers.origin))return send(res,403,{code:'ORIGIN_REJECTED'});res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST');return send(res,200,{ok:true});}
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,time:now()});
    if(req.method==='GET'&&url.pathname==='/status')return send(res,200,{...escrow.status(url.searchParams.get('recipient')),time:now()});
    if(req.method==='POST'&&['/inspect','/claim'].includes(url.pathname)){
      const started=performance.now();let n=0,chunks=[];for await(const b of req){n+=b.length;if(n>65536)throw Object.assign(new Error(),{code:'FILE_TOO_LARGE'});chunks.push(b);}
      const bytes=Buffer.concat(chunks),inputSha256=createHash('sha256').update(bytes).digest('hex');
      const packet=parseEvidenceText(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const time=now();const outcome=url.pathname==='/claim'?escrow.claim(packet,packet.recipient,time):escrow.inspect(packet,time);
      const status=escrow.status(packet.recipient);
      process.send?.({type:'decision',path:url.pathname,accepted:true,time,inputSha256,paidUnits:status.paidUnits});
      return send(res,200,{ok:true,outcome,status,time,acceptedToConfirmedMs:performance.now()-started,receiptId:packet.recipient+':'+manifest.termsHash});
    }
    send(res,404,{code:'NOT_FOUND'});
  }catch(e){process.send?.({type:'decision',accepted:false,code:e.code||'CENTRAL_REQUEST'});send(res,422,{ok:false,code:e.code||'CENTRAL_REQUEST'});}
});
process.on('message',m=>{if(m.type==='origins'){for(const o of m.origins)origins.add(o);process.send?.({type:'origins-ready'});}});
server.listen(0,'127.0.0.1',()=>{const ready={type:'ready',port:server.address().port};if(process.send)process.send(ready);else console.log(JSON.stringify(ready));});
process.on('SIGTERM',()=>server.close(()=>{escrow.close();process.exit(0)}));
