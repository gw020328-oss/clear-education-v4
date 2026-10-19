// Explicit B component. A rows/bindings and default blocked factories are unchanged.
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {Transaction,TypedDataEncoder,verifyTypedData,keccak256} from 'ethers';
import {OwnedExecutionService,RETENTION,verifyCertificate} from '../e5/envelope-service.mjs';
import {ownedTestWallet} from '../e5/environment.mjs';
import {atomicPrivate,ensure,sha,json} from '../e5/private-storage.mjs';
import {businessHashFor,ZERO} from '../e5/reader.mjs';
import {TYPES} from '../../bootcamp-authorization/test-schema-v3.mjs';
import {validateWindowShape,validateBusinessWindow} from './business-window.mjs';
const recoveryPhases=new Set(['RECOVER','RECOVER_FINAL_SYNC','RETENTION','LOOKUP']);
const identityKeys=['intentId','requestId','attemptId','runtimeHash','lineage','commandHash'];
export class BridgeExecutionService extends OwnedExecutionService {
 constructor({gate,...configuration}){
  super({...configuration,controller:{readCurrentSync(){throw Error('E5B_INTERNAL_ONLY');},commitCurrentSync(){throw Error('E5B_INTERNAL_ONLY');}}});
  this.gate=gate;this.proofs=new WeakMap();this.commands=new Map();
  this.db.exec('CREATE TABLE IF NOT EXISTS bridge_adoptions(sequence INTEGER PRIMARY KEY AUTOINCREMENT,ref TEXT NOT NULL,record TEXT NOT NULL);');
 }
 validateBinding(binding,command){
  ensure(binding?.version==='clear-e5-execution-capability.2'&&['EXECUTE','RECOVER'].includes(binding.purpose),'E5B_BINDING_VERSION');
  const {business,purpose,...v1}=binding;super.validateBinding({...v1,version:'clear-e5-execution-capability.1'},command);validateWindowShape(business);this.command(command);this.commands.set(binding.commandHash,structuredClone(command));
 }
 row(ref){const row=super.row(ref);ensure(row.version==='clear-e5-private-envelope.2','E5B_LEGACY_ENVELOPE_READ_ONLY');return row;}
 fence(binding,{recovery=false}={}){
  const state=this.state();ensure(state.lineage===binding.lineage,'E5_LINEAGE_REBASE_REQUIRED');ensure(BigInt(binding.workerFence)>=BigInt(state.fence),'E5_STALE_WORKER');ensure(this.clock()<binding.expiresAt,'E5_LEASE_EXPIRED');
  if(!recovery)ensure(!this.db.prepare('SELECT id FROM stops').get(),'E5_RECOVERY_BLOCKED');
  if(BigInt(binding.workerFence)>BigInt(state.fence))this.db.prepare('UPDATE runtime SET fence=? WHERE id=1').run(binding.workerFence);
 }
 async inspect(binding,command,{track=false}={}){
  const query={applicationId:command.applicationId,nonce:command.method==='accept'?command.args[1].nonce:ZERO};
  const observation=await this.reader.observe(query);if(track)await this.track(observation);
  observation.executionBusinessHash=businessHashFor(command,observation);observation.operationMethod=command.method;
  ensure(observation.executionBusinessHash===binding.businessHash,'E5_BUSINESS_CHANGED');
  const ancestry=await this.reader.ancestry(binding.anchor,observation.checkpoint);await this.reader.checkCommand(command,observation);
  validateBusinessWindow(binding.business,command,observation,this.clock());
  this.proofs.set(observation,{kind:'REGISTERED_CANONICAL_READER',runtimeHash:this.runtimeHash,query,anchor:structuredClone(binding.anchor),current:structuredClone(observation.checkpoint),businessHash:binding.businessHash,commandHash:binding.commandHash,bindingHash:sha(binding),ancestry});
  return observation;
 }
 async authorize({binding,command}){
  this.gate.assertBound();binding=structuredClone(binding);command=structuredClone(command);this.validateBinding(binding,command);
  const observation=binding.purpose==='EXECUTE'?await this.inspect(binding,command):null;
  const proof=observation?this.proofs.get(observation):{kind:'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'};
  const cert=this.gate.invoke('capability',{binding,command,observation,proof,phase:'AUTHORIZE',payload:binding});verifyCertificate(cert,binding,this.manifest.controllerAddress);
  this.transaction(()=>this.fence(binding,{recovery:binding.purpose==='RECOVER'}));return cert;
 }
 current(binding,observation,phase){
  const recovery=recoveryPhases.has(phase),command=this.commands.get(binding.commandHash);ensure(command,'E5B_COMMAND_NOT_REGISTERED');
  let proof={kind:'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'};
  if(!recovery){ensure(binding.purpose==='EXECUTE','E5B_EXECUTION_CAPABILITY_REQUIRED');proof=this.proofs.get(observation);ensure(proof&&proof.bindingHash===sha(binding)&&proof.commandHash===sha(command),'E5B_UNREGISTERED_OBSERVATION');validateBusinessWindow(binding.business,command,observation,this.clock());}
  const payload={version:'clear-e5-current-witness.2',challenge:randomUUID(),phase,bindingHash:sha(binding),observationHash:sha(observation),runtimeHash:this.runtimeHash};
  const cert=this.gate.invoke('current',{binding,command,observation,proof,phase,payload});verifyCertificate(cert,payload,this.manifest.controllerAddress);this.fence(binding,{recovery});
 }
 async checked(binding,command,phase){const observation=await this.inspect(binding,command,{track:true});this.transaction(()=>this.current(binding,observation,phase));return observation;}
 authenticateReference(request,row,purpose){
  const {binding,capability}=request;this.validateBinding(binding,row.command);verifyCertificate(capability,binding,this.manifest.controllerAddress);
  for(const k of identityKeys)ensure(binding[k]===row.binding[k],'E5_REFERENCE_BINDING');
  ensure(sha(binding.business)===sha(row.binding.business)&&request.manifestHash===row.manifestHash,'E5_MANIFEST_HASH');
  if(purpose==='dispatch'||purpose==='adopt')ensure(binding.purpose==='EXECUTE'&&binding.businessHash===row.binding.businessHash,'E5B_EXECUTION_IDENTITY');
 }
 publicEnvelope(row){
  return {version:'clear-e5-public-envelope.2',ref:row.ref,manifestHash:row.manifestHash??null,state:row.state,runtimeHash:row.runtimeHash,intentId:row.binding.intentId,requestId:row.binding.requestId,attemptId:row.binding.attemptId,lineage:row.binding.lineage,commandHash:row.binding.commandHash,originalBindingHash:sha(row.binding),sender:row.sender,transactionNonce:row.nonce,authorizationNonce:row.authorizationNonce??null,to:row.to,value:'0',chainId:this.manifest.chainId,dataHash:row.dataHash??null,txHash:row.txHash??null,businessValidUntil:row.businessValidUntil,originalAuthorityUntil:row.originalAuthorityUntil,bytesUntil:row.bytesUntil};
 }
 lookup({binding,command,capability}){
  this.validateBinding(binding,command);verifyCertificate(capability,binding,this.manifest.controllerAddress);
  const operationId=['claim','approve'].includes(command.method)?null:command.args[0];
  const records=this.db.prepare('SELECT record FROM envelopes WHERE request_id=? OR intent_id=? OR attempt_id=? OR operation_id=?').all(binding.requestId,binding.intentId,binding.attemptId,operationId);
  this.transaction(()=>this.current(binding,{lookup:true},'LOOKUP'));
  if(records.length===0)return {status:'NOT_FOUND',automaticSeal:false};ensure(records.length===1,'E5B_REQUEST_IDENTITY_CONFLICT');const row=JSON.parse(records[0].record);ensure(row.version==='clear-e5-private-envelope.2','E5B_LEGACY_ENVELOPE_READ_ONLY');
  for(const k of identityKeys)ensure(row.binding[k]===binding[k],'E5B_REQUEST_IDENTITY_CONFLICT');ensure(sha(row.command)===sha(command)&&sha(row.binding.business)===sha(binding.business),'E5B_REQUEST_IDENTITY_CONFLICT');
  return {status:row.manifestHash?'FOUND':'FOUND_UNSEALED_HOLD',automaticSeal:false,envelope:this.publicEnvelope(row)};
 }
 envelope(request){const row=this.row(request.ref);this.authenticateReference(request,row,'recover');this.transaction(()=>this.current(request.binding,{recovery:true,ref:row.ref},'RECOVER'));return this.publicEnvelope(row);}
 adoption(ref){const record=this.db.prepare('SELECT record FROM bridge_adoptions WHERE ref=? ORDER BY sequence DESC LIMIT 1').get(ref);return record?JSON.parse(record.record):null;}
 async adopt(request){
  request=structuredClone(request);const row=this.row(request.ref);this.authenticateReference(request,row,'adopt');ensure(row.state==='SEALED','E5B_ADOPTION_SEALED_ONLY');
  ensure(this.clock()<row.businessValidUntil,'E5B_BUSINESS_EXPIRED');const observation=await this.checked(request.binding,row.command,'BEFORE_ADOPTION');await this.reader.ancestry(row.binding.anchor,observation.checkpoint);this.verifyBytes(row);
  return this.transaction(()=>{
   ensure(this.row(row.ref).state==='SEALED','E5B_ADOPTION_SEALED_ONLY');this.current(request.binding,observation,'ADOPTION_FINAL_SYNC');const prior=this.adoption(row.ref);
   if(prior&&prior.bindingHash===sha(request.binding))return structuredClone(prior);
   if(prior)ensure(BigInt(request.binding.workerFence)>=BigInt(prior.binding.workerFence),'E5_STALE_WORKER');
   const record={version:'clear-e5-envelope-adoption.1',adoptionId:'adopt-'+randomUUID(),ref:row.ref,manifestHash:row.manifestHash,originalBindingHash:sha(row.binding),binding:request.binding,bindingHash:sha(request.binding),businessValidUntil:row.businessValidUntil,authorityUntil:Math.min(row.businessValidUntil,request.binding.expiresAt)};record.adoptionHash=sha(record);
   this.db.prepare('INSERT INTO bridge_adoptions(ref,record) VALUES(?,?)').run(row.ref,json(record));return structuredClone(record);
  });
 }
 requireAdoption(request,row){const adoption=this.adoption(row.ref);ensure(adoption&&adoption.adoptionId===request.adoptionId&&adoption.adoptionHash===request.adoptionHash&&adoption.bindingHash===sha(request.binding),'E5B_CURRENT_ADOPTION_REQUIRED');ensure(this.clock()<adoption.authorityUntil&&this.clock()<row.businessValidUntil,'E5B_AUTHORITY_EXPIRED');return adoption;}
 async dispatch(request){
  request=structuredClone(request);let row=this.row(request.ref);this.authenticateReference(request,row,'dispatch');
  if(row.state!=='SEALED')return this.recover(request);const adoption=this.requireAdoption(request,row);
  const observation=await this.checked(request.binding,row.command,'BEFORE_DISPATCH');await this.reader.ancestry(row.binding.anchor,observation.checkpoint);const secret=this.verifyBytes(row);
  await this.reader.rpc('eth_call',[{from:row.sender,to:row.to,value:'0x0',gas:'0x2dc6c0',data:Transaction.from(secret.raw).data},{blockHash:observation.checkpoint.hash,requireCanonical:true}]);
  const payload={version:'clear-e5-api-commit.2',challenge:randomUUID(),ref:row.ref,manifestHash:row.manifestHash,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash,bindingHash:sha(request.binding),runtimeHash:this.runtimeHash};
  const cert=this.gate.invoke('commit',{binding:request.binding,command:row.command,observation,proof:this.proofs.get(observation),phase:'COMMIT',payload,reference:{ref:row.ref,manifestHash:row.manifestHash,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash}});verifyCertificate(cert,payload,this.manifest.controllerAddress);
  this.transaction(()=>{row=this.row(row.ref);ensure(row.state==='SEALED','E5_DISPATCH_STATE');this.requireAdoption(request,row);this.current(request.binding,observation,'SEND_STARTED_FINAL_SYNC');row.state='SEND_STARTED';row.sendStartedAt=this.clock();row.apiCommitHash=sha(cert.payload);row.sendAdoptionHash=adoption.adoptionHash;this.save(row);});
  this.cut('SEND_STARTED_BEFORE_BROADCAST',row);
  try{this.metrics.broadcasts++;const txHash=await this.reader.rpc('eth_sendRawTransaction',[secret.raw]);ensure(txHash===row.txHash,'E5_BROADCAST_HASH');this.cut('BROADCAST_RESPONSE',row);}
  catch{this.transaction(()=>{const r=this.row(row.ref);if(r.state==='SEND_STARTED'){r.state='UNKNOWN';this.save(r);}});return {status:'UNKNOWN',ref:row.ref,txHash:row.txHash};}
  return this.recover(request);
 }
 async seal({binding,command,capability}){
  ensure(binding.purpose==='EXECUTE','E5B_EXECUTION_CAPABILITY_REQUIRED');binding=structuredClone(binding);command=structuredClone(command);this.validateBinding(binding,command);const route=this.command(command);
  verifyCertificate(capability,binding,this.manifest.controllerAddress);
  let observation=await this.checked(binding,command,'BEFORE_SIGN');
  const operationId=['claim','approve'].includes(command.method)?null:command.args[0];
  const prior=this.db.prepare('SELECT record FROM envelopes WHERE request_id=? OR intent_id=? OR attempt_id=? OR operation_id=?').get(binding.requestId,binding.intentId,binding.attemptId,operationId);
  if(prior){const r=JSON.parse(prior.record);ensure(r.version==='clear-e5-private-envelope.2','E5B_LEGACY_ENVELOPE_READ_ONLY');ensure(sha(r.binding)===sha(binding)&&sha(r.command)===sha(command),'E5_IMMUTABLE_REQUEST_CONFLICT');if(['PREPARING','SIGNING_UNCERTAIN'].includes(r.state)&&r.txHash&&existsSync(this.bytesPath(r.ref))){this.verifyBytes(r);this.transaction(()=>{this.current(binding,observation,'RECOVER_DURABLE_SEAL');r.state='SEALED';delete r.failure;r.manifestHash=sha(r);this.save(r);});}
   ensure(r.state==='SEALED'&&r.manifestHash,'E5_EXISTING_ATTEMPT_RECOVER_ONLY');this.verifyBytes(r);return this.public(r);}
  const nonce=BigInt(await this.reader.rpc('eth_getTransactionCount',[route.sender,{blockHash:observation.checkpoint.hash,requireCanonical:true}])).toString();
  ensure(BigInt(nonce)<=BigInt(Number.MAX_SAFE_INTEGER),'E5_TRANSACTION_NONCE_RANGE');
  const pending=BigInt(await this.reader.rpc('eth_getTransactionCount',[route.sender,'pending'])).toString();ensure(nonce===pending,'E5_EXTERNAL_PENDING_NONCE');
  const ref='env-'+randomUUID(),now=this.clock(),row={version:'clear-e5-private-envelope.2',ref,binding,command,...route,nonce,operationId,state:'PREPARING',createdAt:now,businessValidUntil:binding.business.businessValidUntil,originalAuthorityUntil:binding.expiresAt,bytesUntil:now+RETENTION.recoveryBytesSeconds,runtimeHash:this.runtimeHash};
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
  }catch(error){this.transaction(()=>{const current=this.row(ref);if(current.state==='PREPARING'){current.state='SIGNING_UNCERTAIN';current.failure='E5_SEAL_FAILED_NO_RESIGN';this.save(current);}});throw Error(/^E5B?_[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'E5_SEAL_FAILED');}
 }
}
