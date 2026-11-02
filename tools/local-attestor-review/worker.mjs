// Ephemeral public-source rehearsal. No product session, wallet, source account or store.
import {root,source,verifyPrepared} from './prepare.mjs';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import net from 'node:net';import assert from 'node:assert/strict';
verifyPrepared();
const req=createRequire(root+'/src/ybm-collector/package.json');
process.env.LOG_LEVEL='silent';process.env.DISABLE_BGP_CHECKS='1';
const {Wallet}=req('ethers'),signer=Wallet.createRandom(),auth=Wallet.createRandom(),owner=Wallet.createRandom();
process.env.PRIVATE_KEY=signer.privateKey;process.env.AUTHENTICATION_PUBLIC_KEY=auth.signingKey.publicKey;
const report={mode:'ISOLATED_LOCAL_ATTESTOR_PUBLIC_EXAMPLE',sdk:'5.1.4',officialHostedSuccess:false,independentTrust:false,loopbackOnly:true,ephemeralKeys:true,authenticated:false,unauthenticatedRejected:false,nonAllowlistedHostRejected:false,claimVerified:false,officialTrustRejected:false,productAccepted:false,bgpCheckEnabled:false,maximumClaimAttempts:1};
let stage='IMPORT',server,clients=[];const timer=setTimeout(()=>{console.log(JSON.stringify({...report,stoppedAt:stage,timeout:true}));process.exit(2);},90000);
try{
 const {setCryptoImplementation}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls'))),{webcryptoCrypto}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls/webcrypto')));setCryptoImplementation(webcryptoCrypto);
 const {loadAttestorTrust}=await import('../../src/ybm-collector/trust.mjs');
 const official=await loadAttestorTrust(); // Freeze authenticated registry before the example request.
 const sdk=await import(pathToFileURL(req.resolve('@reclaimprotocol/attestor-core'))),WebSocket=req('ws');
 const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
 stage='SERVER';process.chdir(source);const {createServer}=await import(pathToFileURL(source+'/server-review.mjs'));
 const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));server=await createServer(port);
 const url='ws://127.0.0.1:'+port+'/ws';
 const connect=authRequest=>{const c=new sdk.AttestorClient({url,logger:quiet,authRequest,makeWebSocket:u=>{const parsed=new URL(u);assert.equal(parsed.origin,'ws://127.0.0.1:'+port);assert.equal(parsed.pathname,'/ws');return new WebSocket(u,{followRedirects:false,handshakeTimeout:5000,maxPayload:4*1024*1024,perMessageDeflate:false});}});clients.push(c);const wait=c.waitForResponse.bind(c);c.waitForResponse=(...x)=>{const p=wait(...x);p.catch(()=>{});return p;};return c;};
 stage='UNAUTHENTICATED';await assert.rejects(()=>connect().waitForInit(),{message:'User must be authenticated'});report.unauthenticatedRejected=true;
 stage='AUTHENTICATED';const client=connect(await sdk.createAuthRequest({hostWhitelist:['example.com']},auth.privateKey));await client.waitForInit();report.authenticated=true;
 stage='HOST_RESTRICTION';await assert.rejects(()=>client.rpc('createTunnel',{id:123,host:'not-allowed.invalid',port:443},5000),{message:'Host "not-allowed.invalid" not allowed by auth request'});report.nonAllowlistedHostRejected=true;
 stage='PUBLIC_CLAIM';const result=await sdk.createClaimOnAttestor({name:'http',params:{url:'https://example.com/',method:'GET',responseMatches:[{type:'contains',value:'Example Domain'}],responseRedactions:[]},secretParams:{headers:{}},ownerPrivateKey:owner.privateKey,client,logger:quiet,maxRetries:1});
 assert.ok(result.claim);assert.equal(result.signatures.attestorAddress.toLowerCase(),signer.address.toLowerCase());await sdk.assertValidClaimSignatures(result);report.claimVerified=true;
 stage='OFFICIAL_TRUST';assert.ok(!official.includes(signer.address.toLowerCase()));
 // Exercise the real product verifier's signer gate with synthetic request binding.
 // The public example is not a HackerRank proof and never goes to a product API/store.
 const {fixture}=await import('../../tests/hackerrank-evidence/fixture.mjs');
 const f=await fixture({trustPatch:{signers:official}});
 f.input.proofs.account={claim:result.claim,signature:'0x'+Buffer.from(result.signatures.claimSignature).toString('hex'),attestor:signer.address.toLowerCase()};
 const rejected=await f.verifier.verify(f.input,f.request);
 assert.equal(rejected.code,'UNTRUSTED_SIGNER');assert.equal(rejected.gates.paymentAllowed,false);report.officialTrustRejected=true;
}catch{report.stoppedAt=stage;report.failed=true;process.exitCode=1;/* Do not expose raw SDK errors, requests, keys or proof. */}
finally{for(const c of clients)await c.terminateConnection().catch(()=>{});if(server){for(const c of server.clients)c.terminate();await new Promise(resolve=>server.close(resolve));}clearTimeout(timer);console.log(JSON.stringify(report));}
