// Prepare identity and a new TEST realm; no source collection, model call or allocation.
import {mkdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {Wallet} from 'ethers';
import {p0Hash,p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
import {createEnvironment,stopEnvironment,parkEnvironment} from '../../src/hackathon-test-vault/e5/environment.mjs';
import {atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
const now=()=>Math.floor(Date.now()/1000);
export async function prepareLiveInput(){
 const instanceId='normal-live-'+randomUUID(),directory=fileURLToPath(new URL('../../private/bootcamp-normal-live/'+instanceId+'/',import.meta.url));mkdirSync(directory,{recursive:true,mode:0o700});
 const participant=Wallet.createRandom(),operator=Wallet.createRandom();
 atomicPrivate(join(directory,'test-roles.json'),{instanceId,participant:participant.privateKey,operator:operator.privateKey},{exclusive:true});
 const {report,reportHash}=JSON.parse(readFileSync(new URL('../../spikes/moodle-review-api/e6/mapping-report.json',import.meta.url)));
 if(reportHash!=='0x5c475d6f41d23f119f4ed16a6e8de8276051f362717362e5bc5cc39e89a74c28')throw Error('BC_LIVE_OWNER_PIN');
 const mapping={version:'clear-bootcamp-normal-runtime-mapping.1',revision:1,policyHash:p0PolicyHash(P0_POLICY),participantWallet:participant.address.toLowerCase(),
  sourceScope:'LOCAL_GENERATED_DEMO_ACCOUNT_NOT_REAL_IDENTITY',environmentRef:report.environmentRef,runRef:report.runRef,sourceVersion:report.sourceVersion,apiVersion:report.apiVersion,fixtureReportHash:reportHash,courseId:report.courseId,
  targets:{activity:report.activity,assignment:report.assignment,reflection:report.reflection},completionSetupReceiptHash:report.completionSetupReceiptHash,
  moodleUserId:3,accountBindingRef:'normal-demo-user3',hackerRank:{certificateName:'Python (Basic)',trustStatus:'UNCONFIGURED_BLOCKED'}};
 const runtimeMappingHash=p0Hash('NORMAL-REGISTERED-MAPPING',mapping);atomicPrivate(join(directory,'mapping.json'),{mapping,runtimeMappingHash},{exclusive:true});
 const e=await createEnvironment({runtimeMappingHash});let auth,store;
 try{
  if(e.manifest.runtimeMappingHash!==runtimeMappingHash)throw Error('BC_LIVE_CHAIN_MAPPING');
  const startedAt=now(),chainId=Number(e.manifest.chainId);
  auth=createApplicationService({directory:join(directory,'authentication'),origin:'https://clear-normal.example.invalid',chainId,instanceId:e.manifest.instanceId,participants:[participant.address],operators:[operator.address],now});
  const q=auth.challenge({wallet:participant.address,chainId}),r=auth.login({nonce:q.nonce,signature:await participant.signMessage(q.message)},q.browserToken);
  const context={token:r.token,wallet:r.wallet,chainId,csrf:r.csrf};
  store=createBootcampStore({directory:join(directory,'store'),authentication:auth,instanceId,demoStartedAt:startedAt,mode:'ISOLATED_LIVE_TEST',runtimeMappingHash,now,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}]});
  const applicationId=store.createApplication(context,{},'first-normal-application').record.applicationId,v=store.getApplication(context,applicationId);
  const preparation={version:'clear-bootcamp-normal-live-input.1',directory,instanceId,startedAt,environmentId:e.environmentId,runtimeHash:e.manifestHash,runtimeMappingHash,applicationId,participantId:v.participantId,participantWallet:participant.address.toLowerCase(),operatorWallet:operator.address.toLowerCase(),policyHash:v.policyHash,
   moodleBinding:{moodleUserId:3,accountBindingRef:mapping.accountBindingRef,revision:1,assurance:'HOST_APPROVED_GENERATED_DEMO_ACCOUNT',identityVerified:false},
   sourceStatus:'NOT_COLLECTED',hackerRankTrust:'UNCONFIGURED_BLOCKED',aiApprovalCallsRemaining:0,sourceLease:null,finalAllocationAtoms:'0',production:false};
  atomicPrivate(join(directory,'preparation.json'),preparation,{exclusive:true});return preparation;
 }finally{store?.close();auth?.close();stopEnvironment(e.environmentId);parkEnvironment(e.environmentId);}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)prepareLiveInput().then(p=>process.stdout.write(JSON.stringify({prepared:true,path:join(p.directory,'preparation.json'),sourceStatus:p.sourceStatus,allocationAtoms:p.finalAllocationAtoms})+'\n'),e=>{process.stderr.write(/^(BC|E5)_[A-Z0-9_]+$/.test(e.message)?e.message+'\n':'BC_LIVE_PREPARATION_FAILED\n');process.exitCode=1;});
