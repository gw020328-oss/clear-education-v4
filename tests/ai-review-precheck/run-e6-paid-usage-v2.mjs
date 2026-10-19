// Not executed in preparation, even in default mode. No implicit approval.
import {fileURLToPath} from 'node:url';
import {currentE6CodeState} from './e6-quality-runner.mjs';
import {loadE6PaidUsageV2Bundle,jsonSha} from './e6-paid-usage-v2-plan.mjs';
import {createExistingPaidEightTransport,readPaidEightApproval} from './e6-paid-eight-source.mjs';
import {validateE6PaidUsageV2Clearance,withE6PaidUsageV2Store,runE6PaidUsageV2} from './e6-paid-usage-v2-runner.mjs';
const approvalDirectory=fileURLToPath(new URL('../../private/e6-python-paid-usage-v2/',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute-fresh-paid-usage-v2-eight-approval'){
    console.log(JSON.stringify({status:'PAID_USAGE_V2_ACTUAL_BLOCKED',generationCalls:0,countCalls:0,keyRead:false}));return;
  }
  const approval=await readPaidEightApproval(approvalDirectory);
  const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cfg={bundle:loadE6PaidUsageV2Bundle(),approval,codeState:currentE6CodeState(root),day:currentDay(),execution:'ACTUAL',
    currentCodeState:()=>currentE6CodeState(root),currentDay,currentApprovalHash:async()=>jsonSha(await readPaidEightApproval(approvalDirectory))};
  validateE6PaidUsageV2Clearance(cfg);
  const report=await withE6PaidUsageV2Store(fileURLToPath(new URL('../../artifacts/e6-python-paid-usage-v2-run/',import.meta.url)),
    store=>runE6PaidUsageV2({...cfg,store,transportFactory:scope=>createExistingPaidEightTransport(scope)}));
  console.log(JSON.stringify(report));
}
try{await main();}catch{console.log(JSON.stringify({status:'BLOCKED_OR_RECOVERY_REQUIRED',usableForAcceptance:false,paymentAuthority:false}));process.exitCode=1;}
