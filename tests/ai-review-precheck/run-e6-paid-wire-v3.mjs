// Not executed in preparation, even in default mode. No implicit approval.
import {fileURLToPath} from 'node:url';
import {currentE6CodeState} from './e6-quality-runner.mjs';
import {loadE6PaidWireV3Bundle,jsonSha} from './e6-paid-wire-v3-plan.mjs';
import {createExistingPaidEightTransport,readPaidEightApproval} from './e6-paid-eight-source.mjs';
import {validateE6PaidWireV3Clearance,withE6PaidWireV3Store,runE6PaidWireV3} from './e6-paid-wire-v3-runner.mjs';
const approvalDirectory=fileURLToPath(new URL('../../private/e6-python-paid-wire-v3/',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute-fresh-paid-wire-v3-eight-approval'){
    console.log(JSON.stringify({status:'PAID_WIRE_V3_ACTUAL_BLOCKED',generationCalls:0,countCalls:0,keyRead:false}));return;
  }
  const approval=await readPaidEightApproval(approvalDirectory);
  const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cfg={bundle:loadE6PaidWireV3Bundle(),approval,codeState:currentE6CodeState(root),day:currentDay(),execution:'ACTUAL',
    currentCodeState:()=>currentE6CodeState(root),currentDay,currentApprovalHash:async()=>jsonSha(await readPaidEightApproval(approvalDirectory))};
  validateE6PaidWireV3Clearance(cfg);
  const report=await withE6PaidWireV3Store(fileURLToPath(new URL('../../artifacts/e6-python-paid-wire-v3-run/',import.meta.url)),
    store=>runE6PaidWireV3({...cfg,store,transportFactory:scope=>createExistingPaidEightTransport(scope)}));
  console.log(JSON.stringify(report));
}
try{await main();}catch{console.log(JSON.stringify({status:'BLOCKED_OR_RECOVERY_REQUIRED',usableForAcceptance:false,paymentAuthority:false}));process.exitCode=1;}
