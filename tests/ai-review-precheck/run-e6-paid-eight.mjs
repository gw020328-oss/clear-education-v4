// Not executed in preparation, even in default mode. No implicit approval.
import {fileURLToPath} from 'node:url';
import {currentE6CodeState} from './e6-quality-runner.mjs';
import {loadE6PaidEightBundle,jsonSha} from './e6-paid-eight-plan.mjs';
import {createExistingPaidEightTransport,readPaidEightApproval} from './e6-paid-eight-source.mjs';
import {validateE6PaidEightClearance,withE6PaidEightStore,runE6PaidEight} from './e6-paid-eight-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute-new-paid-eight-approval'){
    console.log(JSON.stringify({status:'PAID_EIGHT_ACTUAL_BLOCKED',generationCalls:0,countCalls:0,keyRead:false}));return;
  }
  const approval=await readPaidEightApproval();
  const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cfg={bundle:loadE6PaidEightBundle(),approval,codeState:currentE6CodeState(root),day:currentDay(),execution:'ACTUAL',
    currentCodeState:()=>currentE6CodeState(root),currentDay,currentApprovalHash:async()=>jsonSha(await readPaidEightApproval())};
  validateE6PaidEightClearance(cfg);
  const report=await withE6PaidEightStore(fileURLToPath(new URL('../../artifacts/e6-python-paid-eight-run.v1/',import.meta.url)),
    store=>runE6PaidEight({...cfg,store,transportFactory:scope=>createExistingPaidEightTransport(scope)}));
  console.log(JSON.stringify(report));
}
try{await main();}catch{console.log(JSON.stringify({status:'BLOCKED_OR_RECOVERY_REQUIRED',usableForAcceptance:false,paymentAuthority:false}));process.exitCode=1;}
