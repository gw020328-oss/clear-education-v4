// Real loopback TLS + patched official source + native OPRF + real ephemeral
// attestor signature. No official hosted attestor, YBM login or public chain.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer as createHttpsServer} from 'node:https';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepare,commit} from './prepare-attestor-extension.mjs';
import {createNativeRuntime} from './native-oprf-runtime.mjs';
import {PROVIDER,extensionConfiguration,makeExtension,projectPublicProof,verifyPublicProof} from './attestor-extension.mjs';
import {scoreHtml} from '../../tests/ybm-collector/source-fixture.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const {Wallet}=require('ethers');
const root=fileURLToPath(new URL('../../',import.meta.url)),originalCwd=process.cwd();
const upstream=await prepare(),native=await createNativeRuntime();
const temp=await mkdtemp(join(root,'.toolchain/extension-tls-'));
const tests=[];const check=async(name,fn)=>{await fn();tests.push({name,status:'PASS'});console.log('PASS: '+name);};
let server,wss,client;
const witness=Wallet.createRandom(),owner=Wallet.createRandom();
process.env.PRIVATE_KEY=witness.privateKey;process.env.LOG_LEVEL='silent';process.env.DISABLE_BGP_CHECKS='1';process.env.ALLOWED_DIRECT_HOSTS='localhost';
// Never load the upstream .env.test or its example signing/OPRF keys.
try{
 await writeFile(join(temp,'cert.cnf'),'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-config',join(temp,'cert.cnf'),'-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem')],{stdio:'ignore'});
 const cert=await readFile(join(temp,'cert.pem'),'utf8'),key=await readFile(join(temp,'key.pem'));
 let sourceRows=[{}];
 server=createHttpsServer({cert,key,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(req,res)=>{
  if(req.method!=='GET'||req.url!=='/score'){res.writeHead(404);res.end();return;}
  const body=Buffer.from(scoreHtml(sourceRows));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':body.length});res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const sourceUrl=`https://localhost:${server.address().port}/score`;
 const config=extensionConfiguration({sourceUrl,businessScope:'a'.repeat(64),...native});
 const upstreamImport=path=>import(pathToFileURL(join(upstream,'src',path)));
 process.chdir(upstream);
 const tls=await import(require.resolve('@reclaimprotocol/tls'));
 const {webcryptoCrypto}=await import(require.resolve('@reclaimprotocol/tls/webcrypto'));tls.setCryptoImplementation(webcryptoCrypto);
 globalThis.TLS_ADDITIONAL_ROOT_CA_LIST.push(cert);
 const {providers}=await upstreamImport('providers/index.ts');
 const {PROVIDER_SCHEMAS}=await upstreamImport('types/providers.gen.ts');
 providers[PROVIDER]=providers.http;PROVIDER_SCHEMAS[PROVIDER]=PROVIDER_SCHEMAS.http;
 // Certificate verification remains enabled on both client and attestor.
 providers.http.additionalClientOptions={supportedProtocolVersions:['TLS1_3'],verifyServerCertificate:true};
 const {installExtension}=await upstreamImport('server/utils/clear-extension-bridge.mjs');installExtension(makeExtension(config));
 const {createServer}=await upstreamImport('server/create-server.ts');wss=await createServer(0);
 delete process.env.PRIVATE_KEY;
 const {AttestorClient}=await upstreamImport('client/utils/client-socket.ts');
 const {createClaimOnAttestor}=await upstreamImport('client/create-claim.ts');
 const {WS_PATHNAME}=await upstreamImport('config/index.ts');
 const utils=await upstreamImport('utils/index.ts');
 const proto=await upstreamImport('proto/api.ts');
 const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;},level:'silent'};
 client=new AttestorClient({url:`ws://127.0.0.1:${wss.localTestPort}${WS_PATHNAME}`,logger:quiet});await client.waitForInit();
 const binding={application:'1'.repeat(64),recipient:Wallet.createRandom().address.toLowerCase(),chainId:431798,consumer:Wallet.createRandom().address.toLowerCase()};
 const options={name:PROVIDER,params:config.params,secretParams:{cookieStr:'SYNTHETIC_COOKIE'},ownerPrivateKey:owner.privateKey,client,logger:quiet,zkEngine:'stwo',context:binding};
 const expected={config,witness:witness.address,owner:owner.address.toLowerCase(),binding,now:Math.floor(Date.now()/1000)};
 const claim=async patch=>createClaimOnAttestor({...options,...patch});
 async function rejectedClaim(patch){
  let rejected;try{rejected=await claim(patch);}catch{return;}
  assert(rejected.error);assert(!rejected.claim);assert(!rejected.signatures?.claimSignature?.length);
 }
 let response,proof,verified;
 await check('loopback TLS authenticated, native source OPRF signed and independently verified',async()=>{
  response=await claim();proof=projectPublicProof(response);verified=await verifyPublicProof(proof,expected);
  assert.equal(verified.nullifier.length,64);assert.equal(proof.claim.provider,PROVIDER);
 });
 await check('public projection excludes transcript, cookies, score/date/number/name and prehash',()=>{
  const published=JSON.stringify(proof);
  for(const secret of ['SYNTHETIC_COOKIE','SYNTHETIC_PRIVATE','2026.09.20','123456','Total 850','transcript','privateKey','secretParams'])assert(!published.includes(secret));
  assert.deepEqual(Object.keys(proof).sort(),['claim','signature','signer']);
 });
 await check('mixed ineligible source rows cannot acquire a signed qualifying claim',async()=>{
  sourceRows=[{score:'795'},{date:'2026.08.20',number:'654321',score:'850'}];
  await rejectedClaim();sourceRows=[{}];
 });
 await check('caller-supplied result/context fields rejected before signing',async()=>{
  await rejectedClaim({context:{...binding,nullifier:'c'.repeat(64),qualified:true}});
 });
 await check('caller-selected disclosure/capture policy rejected',async()=>{
  await rejectedClaim({params:{...config.params,responseMatches:[{type:'regex',value:'(?<number>123456)'}]}});
 });
 await check('stock HTTP claim with copied extension facts rejected despite valid witness signature',async()=>{
  const stock=projectPublicProof(await claim({name:'http',context:JSON.parse(proof.claim.context)}));
  await assert.rejects(verifyPublicProof(stock,expected));
 });
 await check('fresh proof with another owner/application keeps same business nullifier',async()=>{
  const other=Wallet.createRandom(),otherBinding={...binding,application:'2'.repeat(64)};
  const again=projectPublicProof(await claim({ownerPrivateKey:other.privateKey,context:otherBinding}));
  const result=await verifyPublicProof(again,{...expected,owner:other.address.toLowerCase(),binding:otherBinding});
  assert.equal(result.nullifier,verified.nullifier);
 });
 await check('binding, deployment, key, time and witness substitutions rejected',async()=>{
  for(const patch of [{owner:Wallet.createRandom().address.toLowerCase()},{witness:Wallet.createRandom().address},{binding:{...binding,recipient:owner.address.toLowerCase()}},{binding:{...binding,chainId:1}},{binding:{...binding,consumer:owner.address.toLowerCase()}},{now:expected.now+1000},{now:expected.now-1000},{config:{...config,keyFingerprint:'e'.repeat(64)}}])await assert.rejects(verifyPublicProof(proof,{...expected,...patch}));
 });
 await check('modified nullifier with recomputed identifier fails real signature verification',async()=>{
  const bad=structuredClone(proof),ctx=JSON.parse(bad.claim.context);ctx.sourceBound.nullifier='e'.repeat(64);bad.claim.context=utils.canonicalStringify(ctx);bad.claim.identifier=utils.getIdentifierFromClaimInfo(bad.claim);
  await assert.rejects(verifyPublicProof(bad,expected));
 });
 await check('additional private public-envelope fields rejected',async()=>assert.rejects(verifyPublicProof({...proof,request:response.request},expected)));
 const rpc=client.rpc.bind(client);
 async function tampered(mutate){
  let mutated=false;
  client.rpc=async(type,data,...rest)=>{
   if(type==='claimTunnel'){
    mutate(data);mutated=true;const bytes=proto.ClaimTunnelRequest.encode({...data,signatures:undefined}).finish();
    data.signatures={requestSignature:await utils.SIGNATURES[client.metadata.signatureType].sign(bytes,owner.privateKey)};
   }
   return rpc(type,data,...rest);
  };
  try{await rejectedClaim();assert(mutated);}finally{client.rpc=rpc;}
 }
 await check('owner-resigned request policy substitution rejected',()=>tampered(data=>{
  data.data.parameters=utils.canonicalStringify({...config.params,url:sourceUrl.replace('/score','/other')});
 }));
 await check('owner-resigned ciphertext tampering rejected against recorded tunnel',()=>tampered(data=>{
  const packet=data.transcript.findLast(p=>p.sender===2&&p.reveal?.directReveal);packet.message[packet.message.length-2]^=1;
 }));
 await check('owner-resigned missing server reveal rejected',()=>tampered(data=>{
  const packet=data.transcript.findLast(p=>p.sender===2&&p.reveal?.directReveal);packet.reveal=undefined;
 }));
 await check('owner-resigned server transformation metadata rejected',()=>tampered(data=>{
  const packet=data.transcript.findLast(p=>p.sender===2&&p.reveal?.directReveal);packet.reveal.zkReveal={proofs:[],toprfs:[],oprfRawMarkers:[],overshotOprfRawLength:0};
 }));
 const report={mode:'LOCAL_PATCHED_OFFICIAL_CORE_REAL_TLS_NATIVE_OPRF_SIGNATURE',upstreamCommit:commit,tests,checksPassed:tests.length,tlsCertificateVerification:true,tunnelTranscriptVerification:true,officialSignatureFormat:true,officialHostedAttestor:false,realYbm:false,publicChain:false,clearAdditionalPaymentSignature:false,attestorSeesPlaintext:true,qualificationStatus:'NO_GO_OFFICIAL_DEPLOYMENT_AND_REAL_SOURCE_NOT_VERIFIED',limits:['Ephemeral local test root, witness and OPRF keys; not a recognized hosted attestor','Candidate server hook requires upstream/official deployment','Synthetic source layout and identity semantics only','No enrollment/learning/inventory completeness or payment integration'],checkedAt:new Date().toISOString()};
 await writeFile(new URL('attestor-extension-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checksPassed:tests.length,qualificationStatus:report.qualificationStatus}));
}finally{
 delete process.env.PRIVATE_KEY;
 await client?.terminateConnection();
 if(wss){for(const c of wss.clients)c.terminate();await new Promise(resolve=>wss.close(resolve));}
 if(server)await new Promise(resolve=>server.close(resolve));
 process.chdir(originalCwd);await native.close();await rm(temp,{recursive:true,force:true});
}
