import './offline.mjs';
import {syntheticVerifier} from './adapter.mjs';
let received=false;
process.on('message',async input=>{
 if(received)process.exit(1);received=true;
 try{
  // LIVE IS DISABLED until the parser, signed preimage and pinned signer are
  // one constrained program and the managed collector integration is reviewed.
  if(input?.scope!=='PUBLIC_SYNTHETIC_ONLY')throw Error('LIVE_DISABLED');
  const verified=await syntheticVerifier({record:input.record,signer:input.signer,clock:()=>input.now})(input.proof);
  verified.private.html.fill(0); // other JS strings cannot promise zeroization
  process.send({ok:true,result:verified.public},()=>process.exit(0));
 }catch{process.send({ok:false},()=>process.exit(1));}
});
