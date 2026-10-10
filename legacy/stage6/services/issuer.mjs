import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Wallet, getAddress } from 'ethers';
import { issueReceipt, validateTrust } from '../lib/evidence.mjs';

const port=Number(process.env.ISSUER_PORT??0),key=process.env.ISSUER_KEY,manifestPath=process.env.MANIFEST_PATH,expected=process.env.EXPECTED_LEARNER;
if(!key||!manifestPath||!expected) throw new Error('ISSUER_CONFIGURATION');
const trusted=validateTrust(JSON.parse(await readFile(manifestPath,'utf8'))),issuer=new Wallet(key),expectedLearner=getAddress(expected);
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw new Error('BODY');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks));}
const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,service:'issuer'});
  if(req.method==='POST'&&req.url==='/issue-all'){
    const parsed=await body(req);if(Object.keys(parsed).join('|')!=='learner'||getAddress(parsed.learner)!==expectedLearner)throw new Error('LEARNER');
    const submissions=[];for(const session of trusted.terms.submissionIds)submissions.push(await issueReceipt(trusted,issuer,expectedLearner,session,trusted.terms.start,trusted.terms.start));
    return json(res,200,{submissions});
  }
  json(res,404,{ok:false,code:'NOT_FOUND'});
}catch{json(res,400,{ok:false,code:'ISSUANCE_REJECTED'});}});
server.listen(port,'127.0.0.1',()=>process.send?.({type:'ready',service:'issuer',port:server.address().port}));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
