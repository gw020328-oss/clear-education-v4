// Not executed in preparation. No environment-key or paid fallback.
import {fileURLToPath} from 'node:url';
import {loadE6FreeBundle,jsonSha} from './e6-free-plan.mjs';
import {currentE6CodeState} from './e6-quality-runner.mjs';
import {createFreeTransport,readFreeControls} from './e6-free-credential.mjs';
import {withE6FreeStore,validateE6FreeClearance,runE6Free} from './e6-free-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute-new-free-e6-approval'){
    console.log(JSON.stringify({status:'FREE_ACTUAL_BLOCKED',generationCalls:0,countCalls:0,keyRead:false}));return;
  }
  const loadControls=()=>readFreeControls();
  const {approval,projectConfirmation}=await loadControls();
  const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cfg={bundle:loadE6FreeBundle(),approval,projectConfirmation,codeState:currentE6CodeState(root),day:currentDay(),execution:'ACTUAL',
    currentDay,currentCodeState:()=>currentE6CodeState(root),currentControlHashes:async()=>{const c=await loadControls();return {
      approvalHash:jsonSha(c.approval),projectConfirmationHash:jsonSha(c.projectConfirmation)};}};
  validateE6FreeClearance(cfg);
  const report=await withE6FreeStore(fileURLToPath(new URL('../../artifacts/e6-python-free-tier-run.v1/',import.meta.url)),
    store=>runE6Free({...cfg,store,transportFactory:scope=>createFreeTransport(scope)}));
  console.log(JSON.stringify(report));
}
try{await main();}catch{console.log(JSON.stringify({status:'BLOCKED_OR_RECOVERY_REQUIRED',usableForAcceptance:false,paymentAuthority:false}));process.exitCode=1;}
