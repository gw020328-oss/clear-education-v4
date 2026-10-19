// No HTTP activation. Composition must install an authenticated synchronous controller.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {unlinkSync,existsSync,openSync,closeSync,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Transaction,Signature,recoverAddress,keccak256,TypedDataEncoder,verifyTypedData} from 'ethers';
import {exactKeys} from '../../policy/values.mjs';
import {TYPES} from '../../bootcamp-authorization/test-schema-v3.mjs';
import {environmentRecord,loadRuntime,ownedTestWallet} from './environment.mjs';
import {privateDirectory,privateFile,atomicPrivate,readPrivate,syncDirectory,sha,json,ensure} from './private-storage.mjs';
import {ExecutionReader,ZERO,businessHashFor} from './reader.mjs';
export const RETENTION=Object.freeze({dispatchSeconds:120,recoveryBytesSeconds:604800,tombstones:'OWNED_ENVIRONMENT_LIFETIME',rawSourcePolicyInherited:false});
const policy={registerCurrentMet:'registrar',allocate:'registrar',startReview:'registrar',observeCurrent:'registrar',replaceTarget:'registrar',bindConsents:'registrar',prepareUnsigned:'registrar',accept:'relayer',terminate:'terminator',registerKey:'keyAdmin',revokeKey:'keyAdmin',setPause:'keyAdmin',fund:'depositor',approve:'depositor',claim:'anycaller'};
const terminal=new Set(['INCLUDED','REVERTED']);
const b32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const uint=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<=BigInt(Number.MAX_SAFE_INTEGER);
export function verifyCertificate(certificate,expected,address){
 ensure(certificate&&sha(certificate.payload)===sha(expected),'E5_CERTIFICATE_BINDING');
 let recovered;try{recovered=recoverAddress(sha(expected),Signature.from(certificate.signature)).toLowerCase();}catch{throw Error('E5_CERTIFICATE_SIGNATURE');}
 ensure(recovered===address.toLowerCase(),'E5_CERTIFICATE_SIGNER');
}
const blocked=()=>({status:'BLOCKED',code:'E5_AUTHENTICATED_API_CONTROLLER_NOT_CONNECTED',production:false});
export function createExecutionService(){return {status:'BLOCKED',seal:async()=>blocked(),dispatch:async()=>blocked(),recover:async()=>blocked()};}
export class OwnedExecutionService {
 constructor({environmentId,controller,reader,clock=()=>Math.floor(Date.now()/1000),cut=()=>{}}){
  ensure(controller&&typeof controller.readCurrentSync==='function'&&typeof controller.commitCurrentSync==='function','E5_API_CONTROLLER_REQUIRED');
  const {dir}=environmentRecord(environmentId);this.environmentId=environmentId;this.manifest=loadRuntime(environmentId);this.reader=reader??new ExecutionReader(this.manifest);ensure(this.reader.runtimeHash===sha(this.manifest),'E5_READER_PIN');
  this.runtimeHash=sha(this.manifest);this.controller=controller;this.clock=clock;this.cut=cut;
  this.root=privateDirectory(join(dir,'envelopes'),{create:true});const path=join(this.root,'metadata.sqlite');
  if(!existsSync(path)){const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);syncDirectory(this.root);}privateFile(path);
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  const oldColumns=this.db.prepare('PRAGMA table_info(envelopes)').all();ensure(!oldColumns.length||(oldColumns.some(c=>c.name==='operation_id')&&this.db.prepare('PRAGMA table_info(authorization_nonces)').all().length),'E5_STORAGE_SCHEMA_UNSUPPORTED');
  this.db.exec(`CREATE TABLE IF NOT EXISTS runtime(id INTEGER PRIMARY KEY CHECK(id=1),hash TEXT NOT NULL,lineage TEXT NOT NULL,fence TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS observations(sequence INTEGER PRIMARY KEY AUTOINCREMENT,record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS authorization_nonces(nonce TEXT PRIMARY KEY,application_id TEXT NOT NULL,lineage TEXT NOT NULL,digest TEXT NOT NULL,prepare_request TEXT UNIQUE NOT NULL,state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipt_observations(sequence INTEGER PRIMARY KEY AUTOINCREMENT,ref TEXT NOT NULL,lineage TEXT NOT NULL,record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stops(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS envelopes(ref TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,intent_id TEXT UNIQUE NOT NULL,attempt_id TEXT UNIQUE NOT NULL,sender TEXT NOT NULL,nonce TEXT NOT NULL,operation_id TEXT UNIQUE,state TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(sender,nonce));`);
  this.db.prepare('INSERT OR IGNORE INTO runtime VALUES(1,?,?,?)').run(this.runtimeHash,'1','0');
  ensure(this.db.prepare('SELECT hash FROM runtime').get().hash===this.runtimeHash,'E5_STORAGE_RUNTIME');
  this.metrics={keyAccesses:0,paymentSignatures:0,transactionSignatures:0,broadcasts:0};
 }
 close(){if(!this.closed){this.db.close();this.closed=true;}}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 state(){return this.db.prepare('SELECT * FROM runtime').get();}
 row(ref){ensure(/^env-[0-9a-f-]{36}$/.test(ref),'E5_REFERENCE');const row=this.db.prepare('SELECT record FROM envelopes WHERE ref=?').get(ref);ensure(row,'E5_UNKNOWN_REFERENCE');return JSON.parse(row.record);}
 save(row){this.db.prepare('UPDATE envelopes SET state=?,record=? WHERE ref=?').run(row.state,json(row),row.ref);}
 bytesPath(ref){ensure(/^env-[0-9a-f-]{36}$/.test(ref),'E5_REFERENCE');return join(this.root,ref+'.json');}
 validateBinding(binding,command){
  exactKeys(binding,['version','intentId','requestId','attemptId','runtimeHash','lineage','workerFence','workerId','leaseId','expiresAt','e3Commitment','commandHash','anchor','businessHash'],'E5_BINDING_SHAPE');
  ensure(binding.version==='clear-e5-execution-capability.1'&&binding.runtimeHash===this.runtimeHash,'E5_CAPABILITY_RUNTIME');
  for(const k of ['intentId','requestId','attemptId','workerId','leaseId'])ensure(typeof binding[k]==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(binding[k]),'E5_BINDING_ID');
  ensure(uint(binding.lineage)&&uint(binding.workerFence)&&Number.isSafeInteger(binding.expiresAt)&&binding.expiresAt>this.clock(),'E5_CAPABILITY_EXPIRED');
  ensure(b32(binding.e3Commitment)&&b32(binding.businessHash)&&binding.commandHash===sha(command),'E5_CAPABILITY_COMMAND');
  ensure(binding.anchor&&b32(binding.anchor.hash)&&/^[0-9]+$/.test(binding.anchor.number),'E5_ANCHOR');
 }
 command(command){
  exactKeys(command,['method','args','applicationId'],'E5_COMMAND_SHAPE');ensure(Object.hasOwn(policy,command.method)&&Array.isArray(command.args)&&b32(command.applicationId),'E5_COMMAND');
  const role=policy[command.method],m=this.manifest,iface=command.method==='approve'?this.reader.token:this.reader.vault;
  if(['accept','prepareUnsigned'].includes(command.method)){ensure(command.args.length===3,'E5_ACCEPT_ARGS');exactKeys(command.args[1],Object.keys(TYPES).flatMap(k=>TYPES[k].map(x=>x.name)),'E5_MESSAGE_SHAPE');}
  else ensure(command.args.length===iface.getFunction(command.method).inputs.length,'E5_COMMAND_ARITY');
  const app=command.method==='claim'?command.args[0]:['accept','prepareUnsigned'].includes(command.method)?command.args[1]?.applicationId:['registerCurrentMet','allocate','startReview','observeCurrent','replaceTarget','bindConsents','terminate'].includes(command.method)?command.args[1]:ZERO;
  ensure(command.applicationId===app,'E5_COMMAND_APPLICATION');
  if(command.method==='approve')ensure(command.args[0].toLowerCase()===m.vaultAddress,'E5_APPROVAL_TARGET');
  // Encoding is a schema/type check; accept's signature is inserted only inside this boundary.
  const args=command.method==='accept'?[command.args[0],command.args[1],'0x',command.args[2]]:command.args;
  iface.encodeFunctionData(command.method,args);
  return {role,sender:role==='anycaller'?environmentRecord(this.environmentId).record.addresses.anycaller:m.roles[role],to:command.method==='approve'?m.tokenAddress:m.vaultAddress};
 }
 current(binding,observation,phase){
  const challenge=randomUUID(),payload={version:'clear-e5-current-witness.1',challenge,phase,bindingHash:sha(binding),observationHash:sha(observation),runtimeHash:this.runtimeHash};
  const cert=this.controller.readCurrentSync({binding:structuredClone(binding),observation:structuredClone(observation),payload});
  ensure(!cert?.then,'E5_SYNCHRONOUS_CURRENT_REQUIRED');verifyCertificate(cert,payload,this.manifest.controllerAddress);
  if(!['RECOVER','RECOVER_FINAL_SYNC','RETENTION'].includes(phase))ensure(!this.db.prepare('SELECT id FROM stops').get(),'E5_RECOVERY_BLOCKED');
  const state=this.state();ensure(state.lineage===binding.lineage,'E5_LINEAGE_REBASE_REQUIRED');ensure(BigInt(binding.workerFence)>=BigInt(state.fence),'E5_STALE_WORKER');ensure(binding.expiresAt>this.clock(),'E5_LEASE_EXPIRED');
  // Persist a newer fence before another worker can sign or dispatch. Epoch is never changed.
  if(BigInt(binding.workerFence)>BigInt(state.fence))this.db.prepare('UPDATE runtime SET fence=? WHERE id=1').run(binding.workerFence);
 }
 async track(observation){
  const last=this.db.prepare('SELECT sequence,record FROM observations ORDER BY sequence DESC LIMIT 1').get();
  if(last){const prior=JSON.parse(last.record),proof=await this.reader.compare(prior.checkpoint,observation.checkpoint);if(proof.status!=='CANONICAL_ANCESTOR'){this.transaction(()=>this.db.prepare('INSERT OR REPLACE INTO stops VALUES(1,?)').run(json(proof)));throw Error('E5_RECOVERY_BLOCKED');}}
  this.transaction(()=>{const latest=this.db.prepare('SELECT sequence FROM observations ORDER BY sequence DESC LIMIT 1').get();ensure(latest?.sequence===last?.sequence,'E5_CHECKPOINT_CAS_RETRY_REQUIRED');this.db.prepare('INSERT INTO observations(record) VALUES(?)').run(json({checkpoint:observation.checkpoint,runtimeHash:this.runtimeHash,finality:'INCLUDED'}));});
 }
 async checked(binding,command,phase){
  const observation=await this.reader.observe({applicationId:command.applicationId,nonce:command.method==='accept'?command.args[1].nonce:ZERO});
  await this.track(observation);
  observation.executionBusinessHash=businessHashFor(command,observation);observation.operationMethod=command.method;
  ensure(observation.executionBusinessHash===binding.businessHash,'E5_BUSINESS_CHANGED');
  await this.reader.ancestry(binding.anchor,observation.checkpoint);
  await this.reader.checkCommand(command,observation);
  // The callback must explicitly revalidate the same business payload when blocks advance.
  // It runs AFTER every awaited chain check, including ancestry and checkPrepared.
  this.transaction(()=>this.current(binding,observation,phase));return observation;
 }
 public(row){return {ref:row.ref,manifestHash:row.manifestHash};}
 async seal({binding,command,capability}){
  binding=structuredClone(binding);command=structuredClone(command);this.validateBinding(binding,command);const route=this.command(command);
  verifyCertificate(capability,binding,this.manifest.controllerAddress);
  let observation=await this.checked(binding,command,'BEFORE_SIGN');
  const operationId=['claim','approve'].includes(command.method)?null:command.args[0];
  const prior=this.db.prepare('SELECT record FROM envelopes WHERE request_id=? OR intent_id=? OR attempt_id=? OR operation_id=?').get(binding.requestId,binding.intentId,binding.attemptId,operationId);
  if(prior){const r=JSON.parse(prior.record);ensure(sha(r.binding)===sha(binding)&&sha(r.command)===sha(command),'E5_IMMUTABLE_REQUEST_CONFLICT');if(['PREPARING','SIGNING_UNCERTAIN'].includes(r.state)&&r.txHash&&existsSync(this.bytesPath(r.ref))){this.verifyBytes(r);this.transaction(()=>{this.current(binding,observation,'RECOVER_DURABLE_SEAL');r.state='SEALED';delete r.failure;r.manifestHash=sha(r);this.save(r);});}
   ensure(r.state==='SEALED'&&r.manifestHash,'E5_EXISTING_ATTEMPT_RECOVER_ONLY');this.verifyBytes(r);return this.public(r);}
  const nonce=BigInt(await this.reader.rpc('eth_getTransactionCount',[route.sender,{blockHash:observation.checkpoint.hash,requireCanonical:true}])).toString();
  ensure(BigInt(nonce)<=BigInt(Number.MAX_SAFE_INTEGER),'E5_TRANSACTION_NONCE_RANGE');
  const pending=BigInt(await this.reader.rpc('eth_getTransactionCount',[route.sender,'pending'])).toString();ensure(nonce===pending,'E5_EXTERNAL_PENDING_NONCE');
  const ref='env-'+randomUUID(),now=this.clock(),row={version:'clear-e5-private-envelope.1',ref,binding,command,...route,nonce,operationId,state:'PREPARING',createdAt:now,dispatchUntil:Math.min(now+RETENTION.dispatchSeconds,binding.expiresAt),bytesUntil:now+RETENTION.recoveryBytesSeconds,runtimeHash:this.runtimeHash};
  this.transaction(()=>{
   this.current(binding,observation,'BEFORE_NONCE_RESERVATION');
   if(['prepareUnsigned','accept'].includes(command.method)){
    const message=command.args[1],digest=TypedDataEncoder.hash(this.manifest.domain,TYPES,message),reservation=this.db.prepare('SELECT * FROM authorization_nonces WHERE nonce=?').get(message.nonce);
    if(command.method==='prepareUnsigned'){ensure(!reservation,'E5_AUTHORIZATION_NONCE_REUSE');this.db.prepare('INSERT INTO authorization_nonces VALUES(?,?,?,?,?,?)').run(message.nonce,command.applicationId,binding.lineage,digest,binding.requestId,'PREPARE_RESERVED');}
    else {ensure(reservation&&reservation.application_id===command.applicationId&&reservation.lineage===binding.lineage&&reservation.digest===digest&&reservation.state==='PREPARED','E5_AUTHORIZATION_NONCE_RESERVATION');this.db.prepare("UPDATE authorization_nonces SET state='PAYMENT_SIGNING_STARTED' WHERE nonce=?").run(message.nonce);}
   }
   const active=this.db.prepare("SELECT state FROM envelopes WHERE sender=? AND state NOT IN ('INCLUDED','REVERTED') LIMIT 1").get(route.sender);ensure(!active,'E5_ROLE_NONCE_BUSY');
   const maximum=this.db.prepare('SELECT nonce FROM envelopes WHERE sender=?').all(route.sender).reduce((n,r)=>BigInt(r.nonce)>n?BigInt(r.nonce):n,-1n);ensure(BigInt(nonce)>maximum,'E5_NONCE_REUSE_BLOCKED');
   this.db.prepare('INSERT INTO envelopes VALUES(?,?,?,?,?,?,?,?,?)').run(ref,binding.requestId,binding.intentId,binding.attemptId,route.sender,nonce,operationId,row.state,json(row));
  });
  this.cut('RESERVED_BEFORE_SIGN',row);
  try{
   this.transaction(()=>this.current(binding,observation,'BEFORE_KEY_FINAL_SYNC'));
   let signature=null,args=command.args;
   if(command.method==='accept'){
    this.metrics.keyAccesses++;signature=await ownedTestWallet(this.environmentId,'initialSigner').signTypedData(this.manifest.domain,TYPES,command.args[1]);this.metrics.paymentSignatures++;
    ensure(verifyTypedData(this.manifest.domain,TYPES,command.args[1],signature).toLowerCase()===this.manifest.signerAddress,'E5_PAYMENT_SIGNATURE');args=[command.args[0],command.args[1],signature,command.args[2]];
   }
   const iface=command.method==='approve'?this.reader.token:this.reader.vault,data=iface.encodeFunctionData(command.method,args);
   const tx={type:2,chainId:BigInt(this.manifest.chainId),nonce:Number(nonce),to:route.to,value:0n,gasLimit:3000000n,maxPriorityFeePerGas:1000000000n,maxFeePerGas:30000000000n,data};
   this.transaction(()=>this.current(binding,observation,'BEFORE_TRANSACTION_KEY_FINAL_SYNC'));
   this.metrics.keyAccesses++;const raw=await ownedTestWallet(this.environmentId,route.role).signTransaction(tx);this.metrics.transactionSignatures++;
   this.cut('SIGNED_BEFORE_RECHECK',row);
   observation=await this.checked(binding,command,'AFTER_SIGN');
   await this.reader.rpc('eth_call',[{from:route.sender,to:route.to,value:'0x0',gas:'0x2dc6c0',data},{blockHash:observation.checkpoint.hash,requireCanonical:true}]);
   this.transaction(()=>this.current(binding,observation,'AFTER_SIGN_FINAL_SYNC'));
   Object.assign(row,{txHash:keccak256(raw),dataHash:keccak256(data),method:command.method,applicationId:command.applicationId,authorizationNonce:command.method==='accept'?command.args[1].nonce:ZERO,rawHash:sha(raw),paymentSignatureHash:signature?sha(signature):null});
   this.reverse(row,{raw,signature});
   this.transaction(()=>{this.current(binding,observation,'BEFORE_PRIVATE_BYTES');this.save(row);});
   atomicPrivate(this.bytesPath(ref),{version:'clear-e5-secret-bytes.1',ref,bindingHash:sha(binding),raw,signature},{exclusive:true});
   this.cut('BYTES_DURABLE_BEFORE_SEALED',row);
   row.manifestHash=sha({...row,state:'SEALED'});row.state='SEALED';
   this.transaction(()=>{ensure(this.row(ref).state==='PREPARING','E5_STATE_CONFLICT');this.current(binding,observation,'SEALED_FINAL_SYNC');this.save(row);});
   this.cut('SEALED_BEFORE_API_COMMIT',row);return this.public(row);
  }catch(error){this.transaction(()=>{const current=this.row(ref);if(current.state==='PREPARING'){current.state='SIGNING_UNCERTAIN';current.failure='E5_SEAL_FAILED_NO_RESIGN';this.save(current);}});throw Error(error.message?.startsWith('E5_')?error.message:'E5_SEAL_FAILED');}
 }
 reverse(row,secret){
  try{const tx=Transaction.from(secret.raw);ensure(tx.hash===row.txHash&&keccak256(secret.raw)===row.txHash&&sha(secret.raw)===row.rawHash&&tx.from?.toLowerCase()===row.sender&&tx.chainId.toString()===this.manifest.chainId&&tx.to?.toLowerCase()===row.to&&tx.value===0n&&String(tx.nonce)===row.nonce&&keccak256(tx.data)===row.dataHash&&tx.type===2&&tx.gasLimit===3000000n&&tx.maxFeePerGas===30000000000n&&tx.maxPriorityFeePerGas===1000000000n,'E5_REVERSE_TRANSACTION');
  if(row.method==='accept')ensure(secret.signature&&sha(secret.signature)===row.paymentSignatureHash&&verifyTypedData(this.manifest.domain,TYPES,row.command.args[1],secret.signature).toLowerCase()===this.manifest.signerAddress,'E5_REVERSE_PAYMENT');
  else ensure(secret.signature===null,'E5_UNEXPECTED_PAYMENT_SIGNATURE');
  const args=row.method==='accept'?[row.command.args[0],row.command.args[1],secret.signature,row.command.args[2]]:row.command.args;
  ensure(tx.data===(row.method==='approve'?this.reader.token:this.reader.vault).encodeFunctionData(row.method,args),'E5_REVERSE_CALLDATA');return secret;}catch(e){throw Error(/^E5_[A-Z0-9_]+$/.test(e.message)?e.message:'E5_PRIVATE_BYTES_INVALID');}
 }
 verifyBytes(row){try{const secret=JSON.parse(readPrivate(this.bytesPath(row.ref)));ensure(secret.version==='clear-e5-secret-bytes.1'&&secret.ref===row.ref&&secret.bindingHash===sha(row.binding),'E5_SECRET_BINDING');return this.reverse(row,secret);}catch(e){throw Error(/^E5_[A-Z0-9_]+$/.test(e.message)?e.message:'E5_PRIVATE_BYTES_UNAVAILABLE');}}
 authenticateReference(request,row,purpose){
  const {binding,capability}=request;this.validateBinding(binding,row.command);verifyCertificate(capability,binding,this.manifest.controllerAddress);
  for(const key of ['intentId','requestId','attemptId','runtimeHash','lineage','commandHash','e3Commitment'])ensure(binding[key]===row.binding[key],'E5_REFERENCE_BINDING');
  ensure(request.manifestHash===row.manifestHash,'E5_MANIFEST_HASH');
  if(purpose==='dispatch')ensure(sha(binding)===sha(row.binding),'E5_DISPATCH_ORIGINAL_FENCE_REQUIRED');
 }
 async dispatch(request){
  request=structuredClone(request);
  let row=this.row(request.ref);this.authenticateReference(request,row,'dispatch');
  if(row.state!=='SEALED')return this.recover(request);
  ensure(this.clock()<row.dispatchUntil,'E5_DISPATCH_DEADLINE');this.cut('BEFORE_DISPATCH_READ',row);
  const observation=await this.checked(request.binding,row.command,'BEFORE_DISPATCH'),secret=this.verifyBytes(row);
  await this.reader.rpc('eth_call',[{from:row.sender,to:row.to,value:'0x0',gas:'0x2dc6c0',data:Transaction.from(secret.raw).data},{blockHash:observation.checkpoint.hash,requireCanonical:true}]);
  const payload={version:'clear-e5-api-commit.1',challenge:randomUUID(),ref:row.ref,manifestHash:row.manifestHash,bindingHash:sha(request.binding),runtimeHash:this.runtimeHash};
  const cert=this.controller.commitCurrentSync({binding:structuredClone(request.binding),payload});ensure(!cert?.then,'E5_SYNCHRONOUS_COMMIT_REQUIRED');verifyCertificate(cert,payload,this.manifest.controllerAddress);
  this.transaction(()=>{row=this.row(row.ref);ensure(row.state==='SEALED','E5_DISPATCH_STATE');ensure(this.clock()<row.dispatchUntil,'E5_DISPATCH_DEADLINE');this.current(request.binding,observation,'SEND_STARTED_FINAL_SYNC');row.state='SEND_STARTED';row.sendStartedAt=this.clock();row.apiCommitHash=sha(cert.payload);this.save(row);});
  this.cut('SEND_STARTED_BEFORE_BROADCAST',row);
  try{this.metrics.broadcasts++;const hash=await this.reader.rpc('eth_sendRawTransaction',[secret.raw]);ensure(hash===row.txHash,'E5_BROADCAST_HASH');this.cut('BROADCAST_RESPONSE',row);}
  catch{this.transaction(()=>{const r=this.row(row.ref);if(r.state==='SEND_STARTED'){r.state='UNKNOWN';this.save(r);}});return {status:'UNKNOWN',ref:row.ref,txHash:row.txHash};}
  return this.recover(request);
 }
 async recover(request){
  request=structuredClone(request);
  const row=this.row(request.ref);this.authenticateReference(request,row,'recover');
  // Recovery authority is independent of source eligibility after an accepted right.
  this.transaction(()=>this.current(request.binding,{recovery:true,txHash:row.txHash??null},'RECOVER'));
  if(!row.txHash)return {status:row.state,ref:row.ref,automaticResign:false};
  let result;try{result=await this.reader.receipt(row);const live=await this.reader.observe({applicationId:row.applicationId,nonce:row.authorizationNonce??ZERO});await this.track(live);if(result.checkpoint)await this.reader.ancestry(result.checkpoint,live.checkpoint);result.currentObservation=live;}catch{result={status:'UNKNOWN',txHash:row.txHash,code:'E5_CANONICAL_READBACK_UNAVAILABLE'};}
  const halted=Boolean(this.db.prepare('SELECT id FROM stops').get());
  this.transaction(()=>{
   this.current(request.binding,{recovery:true,txHash:row.txHash},'RECOVER_FINAL_SYNC');const current=this.row(row.ref);
   this.db.prepare('INSERT INTO receipt_observations(ref,lineage,record) VALUES(?,?,?)').run(row.ref,row.binding.lineage,json(result));
   current.lastObservation={...result}; // Never contains calldata/signatures or raw RPC error text.
   if(halted){current.recoveryBlocked=true;}
   else if(terminal.has(result.status))current.state=result.status;
   else if(result.status==='REORGED')current.state='REORGED';
   else if(['SEND_STARTED','UNKNOWN'].includes(current.state))current.state='UNKNOWN';
   if(!halted&&result.status==='INCLUDED'&&['prepareUnsigned','accept'].includes(row.method)){const nonce=row.command.args[1].nonce;this.db.prepare('UPDATE authorization_nonces SET state=? WHERE nonce=? AND application_id=? AND lineage=? AND state=?').run(row.method==='accept'?'ACCEPTED':'PREPARED',nonce,row.applicationId,row.binding.lineage,row.method==='accept'?'PAYMENT_SIGNING_STARTED':'PREPARE_RESERVED');}
   this.save(current);
  });return halted?{ref:row.ref,status:'RECOVERY_BLOCKED',historicalObservation:result,lineage:row.binding.lineage,automaticPromotion:false}:{ref:row.ref,...result,lineage:row.binding.lineage,automaticResign:false};
 }
 prune(request){
  const row=this.row(request.ref);this.authenticateReference(request,row,'recover');
  this.transaction(()=>this.current(request.binding,{retention:true,ref:row.ref},'RETENTION'));
  ensure(this.clock()>=row.bytesUntil,'E5_RETENTION_NOT_DUE');
  try{const path=this.bytesPath(row.ref);if(existsSync(path)){privateFile(path);unlinkSync(path);syncDirectory(this.root);}row.secretDeletion='DELETED';}
  catch{row.secretDeletion='FAILED';this.transaction(()=>this.save(row));throw Error('E5_SECRET_DELETION_FAILED');}
  row.deletedAt=this.clock();if(row.state==='SEALED')row.state='EXPIRED_UNSENT';
  this.transaction(()=>this.save(row));return {ref:row.ref,status:row.state,secretDeletion:row.secretDeletion,nonceRetained:true,invalidatesBroadcast:false};
 }
}

// Worker composition receives these bound methods only, never the owner instance/DB.
export function workerFacade(service){
 ensure(service instanceof OwnedExecutionService,'E5_OWNER_SERVICE_REQUIRED');
 return Object.freeze({observe:input=>service.reader.observe(structuredClone(input)),seal:request=>service.seal(request),dispatch:request=>service.dispatch(request),recover:request=>service.recover(request)});
}
export function openOwnedExecutionPorts(configuration){const service=new OwnedExecutionService(configuration);return Object.freeze({worker:workerFacade(service),owner:Object.freeze({close:()=>service.close(),prune:request=>service.prune(request)})});}
