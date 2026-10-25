// Prepare identity and a new TEST realm; no source collection, model call or allocation.
import {mkdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {Wallet} from 'ethers';
import {p0Hash,p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
import {createEnvironment,stopEnvironment,parkEnvironment} from '../../src/hackathon-test-vault/e5/environment.mjs';
import {atomicPrivate,readPrivate,privateDirectory} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {LIVE_WORKER_RECIPE_HASH} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
const now=()=>Math.floor(Date.now()/1000);
export async function prepareLiveInput({hackerRankPins=null,identityPreparationPath=null,uiIdentity=null}={}){
 if(uiIdentity){
  const u=new URL(uiIdentity.origin);
  if(identityPreparationPath||u.protocol!=='https:'||u.hostname!=='127.0.0.1'||u.origin!==uiIdentity.origin||Number(u.port)<1024||Number(u.port)>65535
   ||![uiIdentity.participantWallet,uiIdentity.operatorWallet].every(x=>/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20))
   ||uiIdentity.participantWallet===uiIdentity.operatorWallet)throw Error('BC_LIVE_UI_IDENTITY');
 }
 if(uiIdentity&&hackerRankPins?.recipeHash!==LIVE_WORKER_RECIPE_HASH)throw Error('BC_LIVE_HR_WORKER_REQUIRED');
 const instanceId='normal-live-'+randomUUID(),directory=fileURLToPath(new URL('../../private/bootcamp-normal-live/'+instanceId+'/',import.meta.url));mkdirSync(directory,{recursive:true,mode:0o700});
 let participant,operator;
 if(uiIdentity){participant={address:uiIdentity.participantWallet};operator={address:uiIdentity.operatorWallet};}
 else if(identityPreparationPath){
  const previousPath=resolve(identityPreparationPath),previous=privateDirectory(dirname(previousPath)),root=fileURLToPath(new URL('../../private/bootcamp-normal-live/',import.meta.url));
  if(!previous.startsWith(root)||previousPath!==join(previous,'preparation.json'))throw Error('BC_LIVE_OWNER_DIRECTORY');
  const meta=JSON.parse(readPrivate(previousPath)),keys=JSON.parse(readPrivate(join(previous,'test-roles.json')));
  if(resolve(meta.directory)!==previous||keys.instanceId!==meta.instanceId)throw Error('BC_LIVE_KEY_OWNER');
  participant=new Wallet(keys.participant);operator=new Wallet(keys.operator);keys.participant=undefined;keys.operator=undefined;
  if(participant.address.toLowerCase()!==meta.participantWallet||operator.address.toLowerCase()!==meta.operatorWallet)throw Error('BC_LIVE_IDENTITY');
 }else{participant=Wallet.createRandom();operator=Wallet.createRandom();}
 const b32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)&&x!=='0x'+'00'.repeat(32);
 if(hackerRankPins&&!(hackerRankPins.dataMode==='RECLAIM_SIGNED_RECORD'&&b32(hackerRankPins.trustConfigHash)&&b32(hackerRankPins.recipeHash)&&/^0x[0-9a-f]{40}$/.test(hackerRankPins.expectedClaimOwner??'')&&hackerRankPins.expectedClaimOwner!=='0x'+'00'.repeat(20)))throw Error('BC_LIVE_HR_PINS');
 if(!uiIdentity)atomicPrivate(join(directory,'test-roles.json'),{instanceId,participant:participant.privateKey,operator:operator.privateKey},{exclusive:true});
 const {report,reportHash}=JSON.parse(readFileSync(new URL('../../spikes/moodle-review-api/e6/mapping-report.json',import.meta.url)));
 if(reportHash!==p0Hash('E6-FIXTURE-REPORT',report)||reportHash!=='0x5c475d6f41d23f119f4ed16a6e8de8276051f362717362e5bc5cc39e89a74c28')throw Error('BC_LIVE_OWNER_PIN');
 const mapping={version:'clear-bootcamp-normal-runtime-mapping.1',revision:1,policyHash:p0PolicyHash(P0_POLICY),participantWallet:participant.address.toLowerCase(),
  sourceScope:'LOCAL_GENERATED_DEMO_ACCOUNT_NOT_REAL_IDENTITY',environmentRef:report.environmentRef,runRef:report.runRef,sourceVersion:report.sourceVersion,apiVersion:report.apiVersion,fixtureReportHash:reportHash,courseId:report.courseId,
  targets:{activity:report.activity,assignment:report.assignment,reflection:report.reflection},completionSetupReceiptHash:report.completionSetupReceiptHash,
  moodleUserId:3,accountBindingRef:'normal-demo-user3',hackerRank:{certificateName:'Python (Basic)',...(hackerRankPins?{trustStatus:'REVIEWED',audience:hackerRankPins.audience,trustConfigHash:hackerRankPins.trustConfigHash,recipeHash:hackerRankPins.recipeHash,expectedClaimOwner:hackerRankPins.expectedClaimOwner}:{trustStatus:'UNCONFIGURED_BLOCKED'})}};
 const runtimeMappingHash=p0Hash('NORMAL-REGISTERED-MAPPING',mapping);atomicPrivate(join(directory,'mapping.json'),{mapping,runtimeMappingHash},{exclusive:true});
 const e=await createEnvironment({runtimeMappingHash,blockPeriodSeconds:1});let auth,store;
 try{
  if(e.manifest.runtimeMappingHash!==runtimeMappingHash)throw Error('BC_LIVE_CHAIN_MAPPING');
  const startedAt=now(),chainId=Number(e.manifest.chainId);
  if(uiIdentity){
   const preparation={version:'clear-bootcamp-normal-live-input.2',identityMode:'EXTERNAL_UI_WALLETS',origin:uiIdentity.origin,directory,instanceId,startedAt,environmentId:e.environmentId,runtimeHash:e.manifestHash,runtimeMappingHash,
    participantWallet:participant.address,operatorWallet:operator.address,policyHash:mapping.policyHash,applicationId:null,participantId:null,
    moodleBinding:{moodleUserId:3,accountBindingRef:mapping.accountBindingRef,revision:1,assurance:'HOST_APPROVED_GENERATED_DEMO_ACCOUNT',identityVerified:false},
    sourceStatus:'NOT_COLLECTED',hackerRankTrust:hackerRankPins?'REVIEWED_HOST_CONFIGURATION_NOT_YET_COLLECTED':'UNCONFIGURED_BLOCKED',aiApprovalCallsRemaining:0,sourceLease:null,finalAllocationAtoms:'0',production:false};
   atomicPrivate(join(directory,'preparation.json'),preparation,{exclusive:true});return preparation;
  }
  auth=createApplicationService({directory:join(directory,'authentication'),origin:'https://clear-normal.example.invalid',chainId,instanceId:e.manifest.instanceId,participants:[participant.address],operators:[operator.address],now});
  const q=auth.challenge({wallet:participant.address,chainId}),r=auth.login({nonce:q.nonce,signature:await participant.signMessage(q.message)},q.browserToken);
  const context={token:r.token,wallet:r.wallet,chainId,csrf:r.csrf};
  store=createBootcampStore({directory:join(directory,'store'),authentication:auth,instanceId,demoStartedAt:startedAt,mode:'ISOLATED_LIVE_TEST',runtimeMappingHash,now,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}]});
  const applicationId=store.createApplication(context,{},'first-normal-application').record.applicationId,v=store.getApplication(context,applicationId);
  const preparation={version:'clear-bootcamp-normal-live-input.1',directory,instanceId,startedAt,environmentId:e.environmentId,runtimeHash:e.manifestHash,runtimeMappingHash,applicationId,participantId:v.participantId,participantWallet:participant.address.toLowerCase(),operatorWallet:operator.address.toLowerCase(),policyHash:v.policyHash,
   moodleBinding:{moodleUserId:3,accountBindingRef:mapping.accountBindingRef,revision:1,assurance:'HOST_APPROVED_GENERATED_DEMO_ACCOUNT',identityVerified:false},
   sourceStatus:'NOT_COLLECTED',hackerRankTrust:hackerRankPins?'REVIEWED_HOST_CONFIGURATION_NOT_YET_COLLECTED':'UNCONFIGURED_BLOCKED',aiApprovalCallsRemaining:0,sourceLease:null,finalAllocationAtoms:'0',production:false};
  atomicPrivate(join(directory,'preparation.json'),preparation,{exclusive:true});return preparation;
 }finally{store?.close();auth?.close();stopEnvironment(e.environmentId);parkEnvironment(e.environmentId);}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)prepareLiveInput().then(p=>process.stdout.write(JSON.stringify({prepared:true,path:join(p.directory,'preparation.json'),sourceStatus:p.sourceStatus,allocationAtoms:p.finalAllocationAtoms})+'\n'),e=>{process.stderr.write(/^(BC|E5)_[A-Z0-9_]+$/.test(e.message)?e.message+'\n':'BC_LIVE_PREPARATION_FAILED\n');process.exitCode=1;});
