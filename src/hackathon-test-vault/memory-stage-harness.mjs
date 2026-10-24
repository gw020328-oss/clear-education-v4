import {consumeReviewedV20Sources} from './reviewed-source-v20.mjs';
import {normalE2Hash} from './normal-source-compatibility.mjs';
// Explicit TEST-only integration host. Imports test fixtures intentionally:
// it creates its own disposable E1/E3/auth stores, synthetic source and memory EVM.
// It cannot attach an existing chain, key, DB, RPC URL, or caller-provided snapshot.
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Wallet,id,randomBytes,hexlify,keccak256,TypedDataEncoder,verifyTypedData,Signature} from 'ethers';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {storeFixture,START} from '../../tests/bootcamp-store/fixture.mjs';
import {buildExecution} from '../../tests/hackathon-test-vault/execution-build.mjs';
import {buildPreparation} from '../../tests/hackathon-test-vault/build.mjs';
import {P0_POLICY,p0Hash,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {createTestDraftInspector} from '../bootcamp-authorization/test-encoding-v3.mjs';
import {TYPES} from '../bootcamp-authorization/test-schema-v3.mjs';
import {canonical,freeze} from '../policy/values.mjs';
export const MEMORY_STAGE='FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS';
const INTAKE_COMMIT='085878860d604095b0a6152329f8d82a445574b7';
const COMPATIBILITY_PATH='specs/bootcamp/hackathon-test-memory-source-intake-v6.json';
const COMPATIBILITY_SHA='247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const digest=p=>'0x'+createHash('sha256').update(read(p)).digest('hex');
const totals={instances:0,executionDeployments:0,tokenDeployments:0,keyProviderCalls:0,signaturesGenerated:0,signaturesReturned:0,signaturesDiscarded:0,accepts:0,claims:0,actualSources:0,externalRpc:0,persistentChains:0};
export const memoryStageTotals=()=>structuredClone(totals);
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const sent=async p=>(await p).wait();
const cas=t=>({expectedRevision:t.applicationRevision,expectedLedgerSequence:t.ledgerSequence,expectedSnapshotHash:t.currentSnapshotHash});
const eq=(a,b)=>canonical(a)===canonical(b);
const AMOUNT=100000000n;
const HALF=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;
function intake(){
 check(digest('specs/bootcamp/hackathon-test-boundary-intake-v1.json')==='0xcfb42a8f559a54b94188df6f94cb7d67d9a7085b32990ce55968be62904c3fa0','STAGE_INTAKE_FILE_PIN');
 check(digest('specs/bootcamp/hackathon-test-consumer-pins-v1.json')==='0x7b7b63427e98e232a483af41418b551df854195bd083ef430b52df809af2d52d','STAGE_CONSUMER_FILE_PIN');
 const i=JSON.parse(read('specs/bootcamp/hackathon-test-boundary-intake-v1.json'));
 check(i.status==='ACCEPTED_FOR_STAGE_SCOPED_MEMORY_EVM_PAYOUT_HARNESS'&&i.e3.accepted&&i.e3.head==='c3b71c710f558529680e255222857f0e81fe1dcb','STAGE_INTAKE');
 check(eq(i.boundaries.allowedRuntimeKinds,[MEMORY_STAGE])&&!i.boundaries.persistentRuntimeAllowedByThisIntake&&!i.boundaries.fullRuntimeAccepted,'STAGE_SCOPE');
 const e2=JSON.parse(read('specs/bootcamp/hackathon-test-consumer-pins-v1.json'));
 check(digest(COMPATIBILITY_PATH)==='0x'+COMPATIBILITY_SHA,'STAGE_COMPATIBILITY_FILE_PIN');
 const c=JSON.parse(read(COMPATIBILITY_PATH));
 check(c.version==='clear-hackathon-test-memory-source-intake.6'&&c.status==='CANDIDATE_FOR_EXPLICIT_OWNER_GUARD_CONSUMPTION_NOT_COMBINED_ACCEPTANCE'&&c.acceptedE3StageHead===i.e3.head&&c.currentSourceCandidateHead==='92387a49a7808af0f7b240021aafcd01edc17253','STAGE_COMPATIBILITY');
 check(c.normativeBoundary.head===INTAKE_COMMIT&&c.normativeBoundary.path==='specs/bootcamp/hackathon-test-boundary-intake-v1.json'&&digest(c.normativeBoundary.path)==='0x'+c.normativeBoundary.sha256&&c.operationsProfileHash===i.operationsProfileHash,'STAGE_COMPATIBILITY_BOUNDARY');
 check(eq(c.allowedRuntimeKinds,[MEMORY_STAGE])&&!c.persistentRuntimeAllowedByThisIntake&&!c.fullRuntimeAccepted&&!c.existingV1GatesChanged&&!c.productionEnabled,'STAGE_COMPATIBILITY_SCOPE');
 check(c.e2ConsumerInput.path==='specs/bootcamp/hackathon-test-consumer-pins-v1.json'&&digest(c.e2ConsumerInput.path)==='0x'+c.e2ConsumerInput.sha256,'STAGE_COMPATIBILITY_E2');
 check(c.previousCompatibilityRecord.path==='specs/bootcamp/hackathon-test-memory-source-intake-v5.json'&&c.previousCompatibilityRecord.sha256==='7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff'&&digest(c.previousCompatibilityRecord.path)==='0x'+c.previousCompatibilityRecord.sha256&&c.previousCompatibilityRecord.preserveOriginalBytes===true,'STAGE_PREVIOUS_COMPATIBILITY');
 const previous=JSON.parse(read(c.previousCompatibilityRecord.path));
 check(previous.currentSourceCandidateHead==='937f982622643f0759d3ac1da2a42cdac93841b7'&&digest(previous.previousCompatibilityRecord.path)==='0x2cf7aba578d1ac5ed712a00288edcdff88d58e2152acdfd709c1228078f078a6','STAGE_PREVIOUS_COMPATIBILITY');
 const changed=['src/bootcamp/store.mjs','src/bootcamp/moodle-live-consumer.mjs','tools/bootcamp/live-context.mjs'];
 check(eq(c.changedFromV5,changed)&&eq(Object.keys(c.sourceDelta).sort(),[...changed].sort()),'STAGE_COMPATIBILITY_DELTA');
 for(const table of ['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256']){
  check(eq(Object.keys(c[table]).sort(),Object.keys(previous[table]).sort()),'STAGE_COMPATIBILITY_SOURCES');
  for(const [p,before]of Object.entries(previous[table])){
   const delta=c.sourceDelta[p];check(delta?delta.before===before&&delta.after===c[table][p]&&delta.after!==before:c[table][p]===before,'STAGE_COMPATIBILITY_DELTA');
  }
 }
 check(c.normalSourceDeltaInput.path==='specs/bootcamp/hackathon-test-normal-source-intake-v1.json'&&c.normalSourceDeltaInput.sha256==='410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9'&&digest(c.normalSourceDeltaInput.path)==='0x'+c.normalSourceDeltaInput.sha256,'STAGE_NORMAL_SOURCE_DELTA');
 check(Object.keys(c.e3ArtifactSha256).length===8&&Object.keys(c.additionalSourceArtifactSha256).length===19&&Object.keys(c.producerSeamArtifactSha256).length===6&&Object.keys(c.normalEntryArtifactSha256).length===3,'STAGE_COMPATIBILITY_SOURCES');
 check(digest('src/hackathon-test-vault/reviewed-source-v20.mjs')==='0xd5a1d9a92a5d3c43ea0d0b8ed4889a37f966a9650a22e0545a8f752f7ff0de1f','STAGE_SOURCE_PIN');
 const v9=consumeReviewedV20Sources(c);
 for(const [p,sha]of [...Object.entries(i.e4Preparation.artifactSha256),...Object.entries(e2.artifactSha256)])check(digest(p)==='0x'+normalE2Hash(p,sha),'STAGE_SOURCE_PIN');
 return {...i,currentCompatibleSourceHead:v9.currentSourceCandidateHead};
}
export async function createFreshMemoryStage(configuration={}){
 check(configuration&&Object.getPrototypeOf(configuration)===Object.prototype&&Reflect.ownKeys(configuration).length===0,'STAGE_NO_EXTERNAL_CONFIGURATION');
 const accepted=intake(),cleanup=[];
 let raw,provider,wallet,closed=false,closePromise;
 // Every registered resource is attempted even if another cleanup rejects.
 async function close(){
  if(closePromise)return closePromise;
  closed=true;wallet=null;
  closePromise=(async()=>{
   const errors=[];
   for(const release of [()=>provider?.destroy(),()=>raw?.disconnect(),...cleanup.toReversed()]){
    try{await release();}catch{errors.push(new Error('STAGE_RESOURCE_CLEANUP_FAILED'));}
   }
   if(errors.length)throw new AggregateError(errors,'STAGE_CLEANUP_FAILED');
  })();
  return closePromise;
 }
 try{
 const f=await storeFixture({after:fn=>cleanup.push(fn)});
 const build=buildExecution(),assetBuild=buildPreparation().ClearTestToken;
 raw=ganache.provider({logging:{quiet:true},chain:{chainId:431709,hardfork:'shanghai',time:new Date(START*1000)},miner:{timestampIncrement:0},wallet:{totalAccounts:7}});
 provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 let busy=false,opCount=0;const op=()=>id('MEMORY_STAGE_OP_'+(++opCount));
 const accounts=await Promise.all(Array.from({length:7},(_,i)=>provider.getSigner(i))),addresses=await Promise.all(accounts.map(a=>a.getAddress()));
 // New ephemeral signing key only. No getInitialAccounts/privateKey export or persistence.
 wallet=Wallet.createRandom();
 const roles={registrar:addresses[0],initialSigner:wallet.address,keyAdmin:addresses[1],relayer:addresses[2],depositor:addresses[3],terminator:addresses[4]};
 const token=await new ContractFactory(assetBuild.abi,assetBuild.bytecode,accounts[3]).deploy(10000000000n);await token.waitForDeployment();
 const instanceId=hexlify(randomBytes(32));
 // The store default is the frozen P0 runtime mapping; read it from a fresh app below.
 const bootstrapApp=f.create(),appView=f.store.getApplication(f.aliceContext,bootstrapApp),runtimeMappingHash=appView.runtimeMappingHash;
 const vault=await new ContractFactory(build.contract.abi,'0x'+build.contract.evm.bytecode.object,accounts[0]).deploy(await token.getAddress(),instanceId,p0PolicyHash(P0_POLICY),runtimeMappingHash,roles);await vault.waitForDeployment();
 const tokenAddress=(await token.getAddress()).toLowerCase(),vaultAddress=(await vault.getAddress()).toLowerCase();
 const domain={name:'ClearBootcampTestPayment',version:'3',chainId:'431709',verifyingContract:vaultAddress,salt:instanceId};
 const keyId=hexlify(randomBytes(32));await sent(vault.connect(accounts[1]).registerKey(op(),keyId,wallet.address));
 const roleValues=await vault.roles();
 const measuredRoles=Object.fromEntries(Object.keys(roles).map((k,i)=>[k,roleValues[i].toLowerCase()]));
 check(eq(measuredRoles,Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.toLowerCase()]))),'STAGE_ROLE_PIN');
 const pin=freeze({version:'clear-hackathon-memory-runtime.1',kind:MEMORY_STAGE,intakeCommit:INTAKE_COMMIT,e3Head:accepted.e3.head,currentCompatibleSourceHead:accepted.currentCompatibleSourceHead,compatibilityIntake:COMPATIBILITY_PATH,compatibilitySha256:COMPATIBILITY_SHA,
  chainId:domain.chainId,genesisHash:(await provider.send('eth_getBlockByNumber',['0x0',false])).hash,
  vaultAddress,vaultCodeHash:keccak256(await provider.send('eth_getCode',[vaultAddress,'latest'])),tokenAddress,tokenCodeHash:keccak256(await provider.send('eth_getCode',[tokenAddress,'latest'])),
  instanceId,policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash,operationsPolicyHash:await vault.PROFILE(),domainSeparator:await vault.domainSeparator(),typeHash:await vault.TYPE_HASH(),roles:measuredRoles,signerKeyId:keyId,signerAddress:wallet.address.toLowerCase()});
 check(pin.tokenCodeHash===build.tokenCodeHash&&pin.domainSeparator===TypedDataEncoder.hashDomain(domain),'STAGE_DEPLOYMENT_PIN');
 const meta=new Map(),handles=new WeakMap();let cache={checkpoint:null,apps:new Map()};
 const faults={duringSigning:null,providerFailure:false,providerWrongDomain:null};
 const metrics={keyProviderCalls:0,signaturesGenerated:0,signaturesReturned:0,signaturesDiscarded:0,accepts:0,claims:0};
 const bump=k=>{metrics[k]++;totals[k]++;};totals.instances++;totals.executionDeployments++;totals.tokenDeployments++;
 function row(app){check(meta.has(app),'STAGE_APP');return meta.get(app);}
 function identify(m,opaque){return m.registrations.find(r=>r.opaqueTarget.decisionId===opaque)?.registration??null;}
 const current=app=>cache.apps.get(app);
 const wire='SYNTHETIC_PORT_FIXTURE'; // Required E3 wire tag; source truth remains synthetic.
 function funding(ctx){
  const m=row(ctx.applicationId),s=current(ctx.applicationId),a=s?.application,full=a&&[2n,3n,5n].includes(a.state),registered=a&&a.state!==0n;
  const decision=registered?identify(m,a.target.decisionId):ctx;
  let replacement=null;
  if(m.replacement&&full)replacement={...m.replacement,toAllocationVersion:a.version.toString(),toAuthorizationEpoch:a.epoch.toString()};
  return {version:'clear-bootcamp-procedure-funding-port.1',execution:wire,snapshotId:'funding-'+(cache.checkpoint?.number??'none'),status:full?'FULLY_ALLOCATED':'WAITING_FUNDS',
   applicationId:ctx.applicationId,decisionId:decision.decisionId,decisionRevision:registered?Number(a.target.revision):ctx.decisionRevision,decisionHash:registered?a.target.decisionHash:ctx.decisionHash,
   allocationId:full?m.allocationLogical:null,obligationId:m.obligationLogical,recipient:m.recipient,token:tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',reservedAtoms:full?'100000000':'0',
   acceptanceSequence:registered?Number(a.target.acceptanceSequence):ctx.acceptanceSequence,allocationVersion:(a?.version??0n).toString(),authorizationEpoch:(a?.epoch??0n).toString(),replacement,
   queue:full?null:{position:1,shortfallAtoms:'100000000'}};
 }
 function chain({applicationId}){
  const m=row(applicationId),s=current(applicationId),a=s?.application,accepted=a&&[5n,6n].includes(a.state),d=accepted?identify(m,a.target.decisionId):null;
  return {version:'clear-bootcamp-procedure-chain-port.1',execution:wire,snapshotId:'chain-'+(cache.checkpoint?.number??'none'),applicationId,status:accepted?'ACCEPTED':a?.state===4n?'TERMINATED':'UNACCEPTED',
   allocationId:accepted?m.allocationLogical:null,decisionId:d?.decisionId??null,recipient:accepted?m.recipient:null,token:accepted?tokenAddress:null,amountAtoms:accepted?'100000000':null,
   claimState:accepted?(a.state===6n?'CLAIMED':'UNCLAIMED'):null,transactionState:accepted?'INCLUDED':null,transactionHash:accepted?m.lastTransactionHash:null,blockRef:accepted?'block-'+cache.checkpoint.number:null,canonical:true};
 }
 f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];
 f.configuration.procedurePorts={execution:wire,funding,chain,
  registration:ctx=>{const m=row(ctx.applicationId);return {version:'clear-bootcamp-procedure-registration-port.1',execution:wire,registrationId:'registration-'+ctx.applicationId,
   applicationId:ctx.applicationId,decisionId:ctx.decisionId,decisionRevision:ctx.decisionRevision,decisionHash:ctx.decisionHash,allocationId:m.allocationLogical,obligationId:m.obligationLogical,recipient:m.recipient,token:tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',domain};},
  authorization:({applicationId})=>{const m=row(applicationId),s=current(applicationId);return {version:'clear-bootcamp-procedure-authorization-port.1',execution:wire,snapshotId:'authorization-'+cache.checkpoint.number,domain,
   signerKeyId:keyId,signerActive:!!s?.signerActive,authorizationEpoch:(s?.application.epoch??0n).toString(),nonce:m.nonce,nonceAvailable:!!s?.nonceAvailable,expiresAt:m.authorizationExpiry};},
  objectionAssessment:()=>{throw Error('STAGE_ASSESSOR_NOT_CONFIGURED');},revalidationAssessment:()=>{throw Error('STAGE_ASSESSOR_NOT_CONFIGURED');}};
 f.restart();
 const add=(app,context)=>{meta.set(app,{context,recipient:context.wallet.toLowerCase(),allocationLogical:'allocation-'+app,obligationLogical:'obligation-'+app,registrations:[],nonce:hexlify(randomBytes(32)),authorizationExpiry:START+5000,lastTransactionHash:null,replacement:null});return app;};
 add(bootstrapApp,f.aliceContext);
 async function sync(){
  check(!closed,'STAGE_CLOSED');
  const b=await provider.send('eth_getBlockByNumber',['latest',false]),tag=Number(BigInt(b.number)),opts={blockTag:tag};
  const [vaultCode,tokenCode,genesis,chainId,domainHash,typeHash,paused,accounting,key,actualRoles]=await Promise.all([
   provider.send('eth_getCode',[vaultAddress,b.number]),provider.send('eth_getCode',[tokenAddress,b.number]),provider.send('eth_getBlockByNumber',['0x0',false]),provider.send('eth_chainId',[]),vault.domainSeparator(opts),vault.TYPE_HASH(opts),vault.newOperationsPaused(opts),vault.accounting(opts),vault.keys(keyId,opts),vault.roles(opts)]);
  check(keccak256(vaultCode)===pin.vaultCodeHash&&keccak256(tokenCode)===pin.tokenCodeHash&&genesis.hash===pin.genesisHash&&BigInt(chainId).toString()===pin.chainId&&domainHash===pin.domainSeparator&&typeHash===pin.typeHash&&eq(Object.fromEntries(Object.keys(roles).map((k,i)=>[k,actualRoles[i].toLowerCase()])),pin.roles),'STAGE_RUNTIME_PIN');
  const apps=new Map();
  for(const [app,m]of meta){const r=m.registrations.at(-1),opaque=r?.opaqueTarget.applicationId;
   if(opaque)apps.set(app,{application:await vault.application(opaque,opts),nonceAvailable:!await vault.usedNonces(m.nonce,opts),signerActive:key.signer.toLowerCase()===pin.signerAddress&&!key.revoked});}
  const latest=await provider.send('eth_getBlockByNumber',['latest',false]);check(latest.hash===b.hash,'STAGE_CHAIN_MOVED');
  cache={checkpoint:{number:BigInt(b.number).toString(),hash:b.hash,time:Number(BigInt(b.timestamp))},apps,paused,accounting};f.setTime(cache.checkpoint.time);return structuredClone(cache.checkpoint);
 }
 const body=(app,extra={})=>{const v=f.store.getProcedure(row(app).context,app);return {expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,...extra};};
 const view=app=>f.store.getProcedure(row(app).context,app);
 const publication=app=>{const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});try{return JSON.parse(db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence DESC LIMIT 1').get(app).record);}finally{db.close();}};
 async function complete(app){for(const c of P0_POLICY.criteria)await f.accept(app,c.criterionId,row(app).context);}
 async function register(app){await sync();const result=f.store.registerCurrentMetForE4(f.operatorContext,app,body(app),f.key());const registrationId=result.record.target.registrationTargetId;
  const r=f.store.inspectRegistrationForE4(f.operatorContext,app,registrationId).record,m=row(app);m.registrationId=registrationId;m.registrations.push(r);
  const target={decisionId:r.opaqueTarget.decisionId,revision:r.registration.decisionRevision,decisionHash:r.registration.decisionHash,sourceValidUntilExclusive:r.sourceValidUntilExclusive,acceptanceSequence:r.decisionAcceptanceSequence,sourceReceiptHash:r.sourceCurrentCommitment};
  await sent(vault.registerCurrentMet(op(),r.opaqueTarget.applicationId,r.registration.recipient,target));await sync();return r;}
 async function fund(amount){await sent(token.connect(accounts[3]).approve(vaultAddress,amount));await sent(vault.connect(accounts[3]).fund(op(),amount));await sync();}
 async function allocate(app){const m=row(app),r=m.registrations.at(-1),a=current(app).application;await sent(vault.allocate(op(),r.opaqueTarget.applicationId,r.opaqueTarget.allocationId,a.version));await sync();}
 async function publish(app){await sync();f.store.publishReview(row(app).context,app,body(app),f.key());const p=publication(app),a=current(app).application;
  await sent(vault.startReview(op(),row(app).registrations.at(-1).opaqueTarget.applicationId,p.consentScope.procedureId,p.publishedAt,a.version));await sync();return p;}
 function consent(app,which='participant',value='AGREE'){return f.store.recordReviewConsent(which==='operator'?f.operatorContext:row(app).context,app,body(app,{value}),f.key());}
 function setFor(app){const v=view(app),p=publication(app);return {version:'clear-bootcamp-app-consent-set.1',variant:v.consent.bothCurrent?'MUTUAL_CURRENT_APP_CONSENT':'DEADLINE_CURRENT_APP_CONSENT_SET',scopeHash:p.consentScopeHash,
  consents:v.consent.records.map(r=>({id:r.id,actorRole:r.actorRole,actorCommitment:r.actorCommitment,scopeHash:r.scopeHash,recordedAt:r.recordedAt})).sort((a,b)=>a.actorRole<b.actorRole?-1:1),
  objectionVariant:v.objection.records.length?'ASSESSED_RECORDS':'NO_OBJECTIONS',objections:v.objection.records.map(r=>({id:r.id,status:r.assessment?.outcome??'UNASSESSED',assessmentId:r.assessment?.id??null,receiptHash:r.assessment?.receiptHash??null})).sort((a,b)=>a.id<b.id?-1:1)};}
 async function bind(app){await sync();const s=setFor(app),a=current(app).application;await sent(vault.bindConsents(op(),row(app).registrations.at(-1).opaqueTarget.applicationId,p0Hash('E3-APP-CONSENT-SET',s),view(app).consent.bothCurrent,a.version));await sync();}
 async function prepare(app){await sync();const m=row(app),p=f.store.prepareReviewAuthorization(m.context,app,body(app),f.key()),preparationId=p.record.target.preparationId;
  const target=f.store.inspectPreparedForE4(f.operatorContext,app,preparationId);await sent(vault.prepareUnsigned(op(),target.payload.message,current(app).application.version));await sync();
  const latest=f.store.inspectPreparedForE4(f.operatorContext,app,preparationId),h=Object.freeze({stage:MEMORY_STAGE,preparationId});
  handles.set(h,{app,preparationId,target:structuredClone(latest),expectedE3:cas(latest),expectedChain:{...cache.checkpoint,version:current(app).application.version.toString()}});return h;}
 // Synchronous authenticated read repeated immediately next to key use/output.
 // An awaited chain read must not leave an unchecked E3 mutation before signing.
 function authenticatedCurrent(owned){
  const r=f.store.inspectRegistrationForE4(f.operatorContext,owned.app,row(owned.app).registrationId);
  const t=f.store.inspectPreparedForE4(f.operatorContext,owned.app,owned.preparationId,owned.expectedE3);
  check(t.status==='UNSIGNED_PREFLIGHT_ONLY'&&eq(t.payload,owned.target.payload)&&r.record.sourceCurrentCommitment===t.sourceCurrentCommitment,'STAGE_E3_CURRENT');
  const m=t.payload.message;for(const k of ['applicationId','decisionId','allocationId'])check(r.record.opaqueTarget[k]===m[k],'STAGE_REGISTERED_TARGET');
  check(eq(t.payload.domain,domain)&&m.token===tokenAddress&&m.runtimeMappingHash===pin.runtimeMappingHash&&m.policyHash===pin.policyHash&&m.amountAtoms==='100000000','STAGE_RUNTIME_TARGET');
  const inspection=createTestDraftInspector(t.snapshot,{clock:()=>cache.checkpoint.time}).inspect(t.payload,t.currentServerState);check(inspection.status==='UNSIGNED_PREFLIGHT_ONLY','STAGE_E2_CURRENT');
  check(p0Hash('E3-APP-CONSENT-SET',t.consentSet)===m.consentSetHash,'STAGE_CONSENT_RECIPE');
  return {target:t,digest:inspection.hashes.digest};
 }
 async function recheck(h){
  const owned=handles.get(h);check(owned,'STAGE_CAPABILITY_REQUIRED');await sync();const a=current(owned.app).application;
  check(eq({...cache.checkpoint,version:a.version.toString()},owned.expectedChain),'STAGE_CHAIN_CAS');
  const inspected=authenticatedCurrent(owned),m=inspected.target.payload.message;
  check(a.state===3n&&a.allocationId===m.allocationId&&!cache.paused&&cache.accounting.R>=AMOUNT,'STAGE_FULL_RESERVATION');
  const checked=await vault.checkPrepared(m,{blockTag:Number(owned.expectedChain.number)});check(checked.digest===inspected.digest&&checked.canPay===false,'STAGE_PREPARED_DIGEST');
  check((await provider.send('eth_getBlockByNumber',['latest',false])).hash===cache.checkpoint.hash,'STAGE_CHAIN_MOVED');return {owned,...inspected};
 }
 async function sign(h){
  if(closed||busy)return freeze({status:'BLOCKED',code:closed?'STAGE_CLOSED':'STAGE_BUSY',signature:null});busy=true;let generated=false;
  try{const first=await recheck(h);authenticatedCurrent(first.owned);bump('keyProviderCalls');
   if(faults.providerFailure)throw Error('STAGE_PROVIDER_FAILURE');
   const p=structuredClone(first.target.payload);
   if(faults.providerWrongDomain){const k=faults.providerWrongDomain;p.domain[k]=k==='chainId'?'431710':k==='verifyingContract'?addresses[6].toLowerCase():k==='salt'?hexlify(randomBytes(32)):k==='version'?'99':'OtherDomain';}
   const signature=await wallet.signTypedData(p.domain,TYPES,p.message);generated=true;bump('signaturesGenerated');
   if(faults.duringSigning)await faults.duringSigning();
   const final=await recheck(h);authenticatedCurrent(final.owned);check(final.digest===first.digest,'STAGE_TARGET_CHANGED');
   const sig=Signature.from(signature);check(signature.length===132&&[27,28].includes(sig.v)&&BigInt(sig.s)>0n&&BigInt(sig.s)<=HALF&&verifyTypedData(first.target.payload.domain,TYPES,first.target.payload.message,signature).toLowerCase()===pin.signerAddress,'STAGE_PROVIDER_SIGNATURE');
   bump('signaturesReturned');return freeze({status:'SIGNED_MEMORY_STAGE_ONLY',signature,digest:first.digest,payload:structuredClone(first.target.payload),chainCas:structuredClone(first.owned.expectedChain),e3Cas:structuredClone(first.owned.expectedE3)});
  }catch(e){if(generated)bump('signaturesDiscarded');return freeze({status:'BLOCKED',code:/^STAGE_[A-Z0-9_]+$/.test(e.message)?e.message:'STAGE_INTERNAL_CURRENT_REJECTED',signature:null});}
  finally{busy=false;}
 }
 async function accept(h,result,operation=op()){const checked=await recheck(h);authenticatedCurrent(checked.owned);check(result.status==='SIGNED_MEMORY_STAGE_ONLY'&&result.digest===checked.digest&&eq(result.payload,checked.target.payload),'STAGE_SIGNED_TARGET');
  const tx=await vault.connect(accounts[2]).accept(operation,result.payload.message,result.signature,BigInt(checked.owned.expectedChain.version)),receipt=await tx.wait();row(checked.owned.app).lastTransactionHash=tx.hash;bump('accepts');await sync();return receipt;}
 async function claim(app,caller=5){const tx=await vault.connect(accounts[caller]).claim(row(app).registrations.at(-1).opaqueTarget.applicationId),receipt=await tx.wait();row(app).lastTransactionHash=tx.hash;bump('claims');await sync();return receipt;}
 async function observe(app,patch={}){await sync();const a=current(app).application,r=row(app).registrations.at(-1);
  await sent(vault.observeCurrent(op(),r.opaqueTarget.applicationId,{currentMet:a.currentMet,validObjection:a.validObjection,unassessedObjection:a.unassessedObjection,newValidError:a.newValidError,
   sourceValidUntilExclusive:a.target.sourceValidUntilExclusive,observedAt:cache.checkpoint.time,receiptHash:hexlify(randomBytes(32)),...patch},a.version));await sync();}
 async function refreshEvidence(app,at){await provider.send('evm_setTime',[at*1000]);await provider.send('evm_mine',[]);await sync();
  for(const c of P0_POLICY.criteria)f.change(app,c.criterionId,{sourceHash:p0Hash('STAGE-SOURCE',{app,at,c:c.criterionId}),sourceReceiptHash:p0Hash('STAGE-RECEIPT',{app,at,c:c.criterionId}),leaseId:'stage-lease-'+at,authExpiresAt:at+4000,queryExpiresAt:at+4000,rawExpiresAt:at+1800});
  await complete(app);}
 async function replace(app,mode=0){await sync();const m=row(app),before=current(app).application,prior=identify(m,before.target.decisionId);
  const result=f.store.registerCurrentMetForE4(f.operatorContext,app,body(app),f.key()),registrationId=result.record.target.registrationTargetId;
  const r=f.store.inspectRegistrationForE4(f.operatorContext,app,registrationId).record;m.registrationId=registrationId;m.registrations.push(r);
  const target={decisionId:r.opaqueTarget.decisionId,revision:r.registration.decisionRevision,decisionHash:r.registration.decisionHash,sourceValidUntilExclusive:r.sourceValidUntilExclusive,acceptanceSequence:r.decisionAcceptanceSequence,sourceReceiptHash:r.sourceCurrentCommitment};
  const receipt=await sent(vault.replaceTarget(op(),r.opaqueTarget.applicationId,target,mode,before.version));
  const event=receipt.logs.map(log=>{try{return vault.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='TargetReplaced');check(event,'STAGE_REPLACEMENT_EVENT');
  m.replacement={version:'clear-bootcamp-allocation-replacement-receipt.1',allocationId:m.allocationLogical,fromDecisionId:prior.decisionId,fromDecisionHash:event.args.previous.decisionHash,
   fromAuthorizationEpoch:event.args.previous.epoch.toString(),toDecisionId:r.registration.decisionId,toDecisionHash:event.args.current.decisionHash,toAuthorizationEpoch:event.args.current.epoch.toString(),
   fromAllocationVersion:event.args.previous.appVersion.toString(),toAllocationVersion:event.args.current.appVersion.toString(),receiptHash:keccak256(receipt.logs.find(log=>{try{return vault.interface.parseLog(log)?.name==='TargetReplaced';}catch{return false;}}).data)};
  await sync();return receipt;}
 let assessmentNumber=0;
 async function newValidError(app){await sync();const v=view(app),assessmentId='stage-assessment-'+(++assessmentNumber),evidenceId=f.store.getApplication(row(app).context,app).evidence[0].record.evidenceId;
  const value={version:'clear-bootcamp-procedure-assessment.1',execution:wire,assessmentId,applicationId:app,basisEvidenceIds:[evidenceId],receiptHash:hexlify(randomBytes(32)),fromDecisionId:v.decisionId,fromDecisionHash:v.decisionHash,kind:'OBJECTIVE_ERROR'};
  f.configuration.procedurePorts.revalidationAssessment=({assessmentId:id})=>{check(id===assessmentId,'STAGE_ASSESSMENT_ID');return value;};
  f.store.recordReviewRevalidation(row(app).context,app,body(app,{assessmentId}),f.key());await observe(app,{newValidError:true});return assessmentId;}
 async function terminate(app){await sync();const m=row(app),opResult=f.store.requestReviewTermination(m.context,app,body(app),f.key()),intent=f.store.inspectTerminationForE4(f.operatorContext,app,opResult.record.target.terminationIntentId).intent;
  const reason={REVIEW_CAP_UNRESOLVED:1,NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION:2,EXPIRED_EVIDENCE_NOT_REFRESHED_WITHIN_CAP:3}[intent.reason];check(reason,'STAGE_TERMINATION_REASON');
  const receipt=await sent(vault.connect(accounts[4]).terminate(op(),m.registrations.at(-1).opaqueTarget.applicationId,reason,intent.sourceHeadCommitment,current(app).application.version));await sync();return {receipt,intent};}
 await sync();
 return {kind:MEMORY_STAGE,pin,domain,provider,raw,vault,token,accounts,roles,keyId,op,metrics,faults,firstApp:bootstrapApp,
  // These controls are test-host authority over this fresh instance, never HTTP input.
  evidence:f,view,body,publication,setFor,complete,register,fund,allocate,publish,consent,bind,prepare,sign,accept,claim,sync,observe,refreshEvidence,replace,newValidError,terminate,close,
  newApp(context=f.aliceContext){return add(f.create(context),context);},
  target(h){check(handles.has(h),'STAGE_CAPABILITY_REQUIRED');return structuredClone(handles.get(h).target);},
  chainState:app=>current(app).application,registration:app=>structuredClone(row(app).registrations.at(-1)),
  async time(at){await provider.send('evm_setTime',[at*1000]);await provider.send('evm_mine',[]);await sync();},
  async ready({app=bootstrapApp,route='1',deposit=AMOUNT}={}){await complete(app);await register(app);if(deposit)await fund(deposit);await allocate(app);await publish(app);if(route==='1'){consent(app);consent(app,'operator');}else await this.time(START+120);await bind(app);return prepare(app);},
  // Explicit adversarial controls cannot install a key, provider, arbitrary runtime,
  // or issue opaque IDs. They only alter this test host's selected nonce/expiry.
  async nextNonce(app,nonce=hexlify(randomBytes(32))){row(app).nonce=nonce;await sync();},
  async expiry(app,time){row(app).authorizationExpiry=time;await sync();},
 };
 }catch(error){
  try{await close();}catch{throw new Error('STAGE_INITIALIZATION_AND_CLEANUP_FAILED');}
  throw error;
 }
}
