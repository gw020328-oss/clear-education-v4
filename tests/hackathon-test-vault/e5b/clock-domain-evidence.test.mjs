// Fresh synthetic chain only. Report fixed reason codes and times, never RPC payloads.
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,hash} from '../e5/fixture.mjs';
import {stopEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
async function rejectAt(f,method,args,block,reason){
 const response=await fetch(f.m.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{from:f.m.roles.registrar,to:f.m.vaultAddress,data:f.reader.vault.encodeFunctionData(method,args)},{blockHash:block.hash,requireCanonical:true}]})});
 const value=await response.json();assert.equal(value.error?.code,3);assert.ok(value.error.message.endsWith(': '+reason));return {rpcCode:value.error.code,reason};
}
async function afterHead(f){const b=await f.reader.block();await new Promise(r=>setTimeout(r,Math.max(0,(Number(b.timestamp)+1)*1000-Date.now()+5)));const same=await f.reader.block();assert.equal(same.hash,b.hash);assert.ok(Math.floor(Date.now()/1000)>Number(b.timestamp));return b;}
test('on-demand Geth exposes exact publication and authorization clock-domain rejections',async t=>{
 const f=await fixture();t.after(()=>{f.close();stopEnvironment(f.id);parkEnvironment(f.id);});
 const {msg}=await f.ready(),block=await afterHead(f),issuedAt=Math.floor(Date.now()/1000),future={...msg,issuedAt:String(issuedAt)};
 const authorization=await rejectAt(f,'checkPrepared',[future],block,'AUTHORIZATION_TIME');
 t.diagnostic(JSON.stringify({phase:'AUTHORIZATION_TIME',wallTime:issuedAt,blockTime:Number(block.timestamp),issuedAt,publishedAt:Number(msg.decisionPublishedAt),expiresAt:Number(msg.expiresAt),sourceUntil:Number(msg.sourceValidUntilExclusive),reviewUntil:Number(msg.firstReviewStartedAt)+600,...authorization}));
 const app=hash(),at=Math.floor(Date.now()/1000),target={decisionId:hash(),revision:'1',decisionHash:hash(),sourceValidUntilExclusive:String(at+240),acceptanceSequence:String((await f.vault.lastAcceptanceSequence())+1n),sourceReceiptHash:hash()};
 await f.sent(f.token.approve(f.m.vaultAddress,100000000n));await f.sent(f.vault.connect(f.wallet('depositor')).fund(hash(),100000000n));await f.sent(f.vault.registerCurrentMet(hash(),app,f.wallet('recipient').address,target));await f.sent(f.vault.allocate(hash(),app,hash(),1));
 const a=await f.vault.application(app),publicationBlock=await afterHead(f),publishedAt=Math.floor(Date.now()/1000);
 const publication=await rejectAt(f,'startReview',[hash(),app,hash(),publishedAt,a.version],publicationBlock,'PUBLICATION');
 t.diagnostic(JSON.stringify({phase:'PUBLICATION',wallTime:publishedAt,blockTime:Number(publicationBlock.timestamp),publishedAt,allocatedAt:Number(a.allocatedAt),targetRecordedAt:Number(a.targetRecordedAt),sourceUntil:Number(target.sourceValidUntilExclusive),...publication}));
});
