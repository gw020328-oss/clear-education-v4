// This command is not executed during preparation. No default authorization.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {loadE6RunnerBundle,currentE6CodeState,validateE6Clearance,withE6RunStore,runE6Quality} from './e6-quality-runner.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute-new-e6-approval'){
    console.log(JSON.stringify({status:'ACTUAL_BLOCKED',keyRead:false,countCalls:0,generationCalls:0}));return;
  }
  // Fixed private paths prevent choosing another journal to bypass one-shot use.
  const controls=new URL('../../private/e6-python-quality-v1/',import.meta.url);
  const approval=JSON.parse(await readFile(new URL('approval.json',controls),'utf8'));
  const verification=JSON.parse(await readFile(new URL('cost-verification.json',controls),'utf8'));
  const bundle=loadE6RunnerBundle(),codeState=currentE6CodeState(root);
  const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day=currentDay();
  const config={bundle,approval,verification,codeState,day,currentDay,execution:'ACTUAL',currentCodeState:()=>currentE6CodeState(root)};
  validateE6Clearance(config); // Before even creating a journal or transport.
  const report=await withE6RunStore(fileURLToPath(new URL('../../artifacts/e6-python-quality-run.v1/',import.meta.url)),
    store=>runE6Quality({...config,store,transportFactory:()=>developerTransport()}));
  console.log(JSON.stringify(report));
}
try{await main();}catch{console.log(JSON.stringify({status:'BLOCKED_OR_RECOVERY_REQUIRED',usableForAcceptance:false,paymentAuthority:false}));process.exitCode=1;}
