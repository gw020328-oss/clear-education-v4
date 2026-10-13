// OPTIONAL Mac arm64 crypto experiment: downloads four public upstream artifacts
// pinned to the SDK's commit, verifies Git blob IDs, runs synthetic data only.
// No attestor RPC, real credentials, TLS capture, public chain or persisted key.
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,symlink,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {POLICY,inspectRecord,evaluateAtAttestor,scopedOprfInput,OPRF_DOMAIN,finaliseSingleSharePinned} from './record-policy.mjs';
import {scoreHtml} from '../../tests/ybm-collector/source-fixture.mjs';
if(process.platform!=='darwin'||process.arch!=='arm64'||process.versions.node!=='24.21.0')throw Error('PINNED_MAC_ARM64_ONLY');
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const packageRoot=dirname(dirname(require.resolve('@reclaimprotocol/zk-symmetric-crypto')));
const commit='394f777fa404ef184652b6efc5aa60884dd55c7e';
const artifacts=[
 ['bin/gnark/darwin-arm64-libprove.so','976c13e2270ea606de550010a0cebb1a3122e98f',10045570],
 ['bin/gnark/darwin-arm64-libverify.so','81597ceb79aa9f66c81dea4634004abf88e3913d',6324146],
 ['resources/gnark/pk.chacha20_oprf','6c33821abf28a37cf2c672dd48187a8c7fa7ed90',13746795],
 ['resources/gnark/r1cs.chacha20_oprf','d53bc6905fe614e23d8bbc250544358bdaf65cf6',4655088],
];
// The pinned native loader mishandles percent-encoded file URL paths. Isolate
// an unchanged package copy in an ASCII temp path; never patch collector deps.
const temp=await mkdtemp(join(tmpdir(),'clear-oprf-synthetic-'));
const tests=[],manifest=[];
const check=async(name,fn)=>{await fn();tests.push({name,status:'PASS'});};
try{
 await cp(join(packageRoot,'lib'),join(temp,'package/lib'),{recursive:true});
 await cp(join(packageRoot,'package.json'),join(temp,'package/package.json'));
 await symlink(fileURLToPath(new URL('../../src/ybm-collector/node_modules',import.meta.url)),join(temp,'node_modules'),'dir');
 for(const [path,blob,size] of artifacts){
  const response=await fetch(`https://raw.githubusercontent.com/reclaimprotocol/zk-symmetric-crypto/${commit}/${path}`,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('PUBLIC_ARTIFACT_DOWNLOAD');
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length,size);assert.equal(createHash('sha1').update(`blob ${size}\0`).update(bytes).digest('hex'),blob);
  const dest=join(temp,'package',path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);
  manifest.push({path,gitBlob:blob,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const {makeGnarkOPRFOperator}=await import(pathToFileURL(join(temp,'package/lib/gnark/toprf.js')));
 const op=makeGnarkOPRFOperator({algorithm:'chacha20',fetcher:{fetch:async(engine,name)=>readFile(join(temp,'package/resources',engine,name))}});
 const keys=await op.generateThresholdKeys(2,1),other=await op.generateThresholdKeys(2,1);
 const fingerprint=k=>createHash('sha256').update(k.publicKey).digest('hex');
 async function run(input,domain,k=keys){
  const request=await op.generateOPRFRequestData(input,domain);
  const response=await op.evaluateOPRF(k.shares[0].privateKey,request.maskedData);
  const output=await finaliseSingleSharePinned(op,k.publicKey,request,[{...response,publicKeyShare:k.shares[0].publicKey}]);
  return {output,keyFingerprint:fingerprint(k)};
 }
 const scope='a'.repeat(64),otherScope='b'.repeat(64),body=Buffer.from(scoreHtml([{}]));
 const identity=inspectRecord(body).identity,input=scopedOprfInput(identity,scope),first=await run(input,OPRF_DOMAIN);
 await check('full native OPRF output has 32 bytes',()=>assert.equal(first.output.length,32));
 await check('fresh blinding randomness preserves same exam/program output',async()=>{
  for(let i=0;i<3;i++)assert.deepEqual((await run(input,OPRF_DOMAIN)).output,first.output);
 });
 await check('different program scopes produce different outputs',async()=>assert.notDeepEqual((await run(scopedOprfInput(identity,otherScope),OPRF_DOMAIN)).output,first.output));
 await check('different exam produces different output',async()=>assert.notDeepEqual((await run(scopedOprfInput(inspectRecord(Buffer.from(scoreHtml([{number:'654321'}]))).identity,scope),OPRF_DOMAIN)).output,first.output));
 await check('changed OPRF key changes output: rotation is not dedup-safe',async()=>assert.notDeepEqual((await run(input,OPRF_DOMAIN,other)).output,first.output));
 await check('counterexample: pinned native binary does not reject mismatched finalize public key',async()=>{
  const req=await op.generateOPRFRequestData(input,OPRF_DOMAIN),res=await op.evaluateOPRF(other.shares[0].privateKey,req.maskedData);
  assert.notDeepEqual(other.publicKey,keys.publicKey);
  const responses=[{...res,publicKeyShare:other.shares[0].publicKey}];
  const unchecked=await op.finaliseOPRF(keys.publicKey,req,responses);
  assert( unchecked.length>0&&unchecked.length<=32 );
 });
 await check('explicit one-share pin rejects alternate key before native finalize',async()=>{
  const req=await op.generateOPRFRequestData(input,OPRF_DOMAIN),res=await op.evaluateOPRF(other.shares[0].privateKey,req.maskedData);
  await assert.rejects(finaliseSingleSharePinned(op,keys.publicKey,req,[{...res,publicKeyShare:other.shares[0].publicKey}]),/OPRF_SHARE_PIN/);
 });
 const opts={body,sourceUrl:POLICY.source,sourceMethod:POLICY.method,transformedRanges:[],businessScope:scope,configuredKey:fingerprint(keys),evaluateOprf:run};
 const fact=await evaluateAtAttestor(opts);
 await check('reproof/other wallet/application/disclosure metadata cannot change nullifier',async()=>{
  const again=await evaluateAtAttestor({...opts,body:Buffer.from(scoreHtml([{score:'990'}]).replace(/<\/td><td>/g,'</td> \n<td>')),owner:'SYNTHETIC_OTHER_WALLET',application:'SYNTHETIC_OTHER_APP',redactionSelector:'OTHER',timestamp:1});
  assert.equal(again.nullifier,fact.nullifier);
 });
 await check('attestor policy rejects rotated key instead of opening new spend namespace',async()=>assert.rejects(evaluateAtAttestor({...opts,evaluateOprf:(a,b)=>run(a,b,other)}),/OPRF_KEY_CHANGED/));
 const report={mode:'LOCAL_GNARK_OPRF_AND_ATTESTOR_EXTENSION_PROTOTYPE',platform:'darwin-arm64',sdk:'zk-symmetric-crypto@5.1.6',artifactCommit:commit,artifacts:manifest,tests,checksPassed:tests.length,
  scope:'one exam once per fixed business program across wallets/applications; separate programs permitted',
  qualificationStatus:'NO_GO_OFFICIAL_EXTENSION_AND_PRIVATE_SOURCE_BINDING_NOT_DEPLOYED',
  realYbm:false,officialAttestor:false,tlsProof:false,oprfCircuitProof:false,onchain:false,live:false,
  trust:['Synthetic 1-of-2 OPRF setup generated in memory; one share used, not official key material or threshold resilience','Attestor extension assumes authenticated full plaintext and trusted transformation provenance','Attestor sees exam date/registration; public fact omits them','Existing stock HTTP provider does not execute this extension'],checkedAt:new Date().toISOString()};
 await writeFile(new URL('oprf-native-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({mode:report.mode,checksPassed:tests.length,qualificationStatus:report.qualificationStatus}));
}finally{await rm(temp,{recursive:true,force:true});}
