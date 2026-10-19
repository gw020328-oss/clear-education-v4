// Dedicated evaluation runner. Importing this module reads no key or private state.
import {open,readFile,unlink,mkdir,lstat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {prepareE6QualityPlan,loadE6QualityCorpus,assessE6QualityResponse,sha} from './e6-quality-plan.mjs';

const fail=code=>{throw Error(code);};
const check=(condition,code)=>{if(!condition)fail(code);};
const hash=v=>sha(JSON.stringify(v));
const digits=v=>typeof v==='string'&&/^(0|[1-9]\d{0,14})$/.test(v);
const sha256=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fixedErrors=new Set(['E6_CHECKPOINT_FAILED','E6_CODE_PIN','E6_CLEARANCE','E6_BILLING_UNKNOWN','E6_BUDGET',
  'E6_INPUT_LIMIT','E6_OUTPUT_UNKNOWN','E6_OUTPUT_LIMIT','E6_MODEL_PIN','E6_RESPONSE','E6_TIMEOUT',
  'GEMINI_KEY_MISSING','GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE',
  'GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED','GEMINI_EMPTY_RESPONSE','GEMINI_RESPONSE_SIZE','GEMINI_RESPONSE_INVALID']);
const errorCode=e=>fixedErrors.has(e?.message)?e.message:'E6_REQUEST_UNKNOWN';
export const E6_RUN_VERSION='clear-e6-python-quality-run.1';
export const E6_METHOD_SCOPE='v1beta/models/gemini-3.5-flash-lite:generateContent+countTokens';

export function currentE6CodeState(root){
  try{return {head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    clean:execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).trim()===''};}
  catch{fail('E6_CODE_PIN');}
}
export function loadE6RunnerBundle(){
  const prepared=prepareE6QualityPlan(),committed=JSON.parse(readFileSyncPlan());
  check(JSON.stringify(prepared.plan)===JSON.stringify(committed),'E6_PLAN_PIN');
  return {...structuredClone(prepared),corpus:loadE6QualityCorpus().corpus};
}
// Lazy file access: never performed merely by importing the runner.
import {readFileSync} from 'node:fs';
function readFileSyncPlan(){return readFileSync(new URL('./e6-python-approval-plan.json',import.meta.url),'utf8');}

// Approval/verification are trusted operator control records, never provider data.
// These are attestations to reviewed evidence, not cryptographic proof of billing.
export function validateE6Clearance({bundle,approval,verification,codeState,day,execution}){
  const p=bundle.plan;
  check(hash(bundle)===hash(loadE6RunnerBundle()),'E6_PLAN_PIN');
  check(['MOCK','ACTUAL'].includes(execution),'E6_CLEARANCE');
  check(approval?.version==='clear-e6-python-user-approval.1'&&approval.explicitNewApproval===true
    &&approval.scope==='E6_PYTHON_TEXT_ONLY'&&approval.existingSecureKeyConfigurationConfirmed===true
    &&approval.approvedOn===day&&approval.planHash===p.planHash&&approval.codeHead===codeState.head
    &&/^[a-f0-9]{40}$/.test(approval.codeHead??'')&&codeState.clean===true
    &&sha256(approval.authorizationEvidenceSha256)
    &&approval.maxCountCalls===8&&approval.maxGenerationCalls===8&&approval.automaticRetries===0
    &&approval.continuations===0&&approval.budgetNanoUsd==='50000000','E6_CLEARANCE');
  const identity={codeHead:approval.codeHead,planHash:p.planHash,corpusSha256:p.corpusSha256,
    goldSha256:p.goldSha256,requestsSha256:p.requestsSha256};
  check(approval.pins&&Object.keys(approval.pins).length===Object.keys(identity).length
    &&Object.entries(identity).every(([k,v])=>approval.pins[k]===v),'E6_CLEARANCE');
  check(bundle.corpus.synthetic===true&&bundle.corpus.cases.length===8&&bundle.requests.length===8
    &&sha(JSON.stringify(bundle.requests,null,2)+'\n')===p.requestsSha256,'E6_PLAN_PIN');
  const v=verification;
  check(v?.version==='clear-e6-python-cost-verification.1'&&v.reviewedOn===day&&v.planHash===p.planHash
    &&v.codeHead===approval.codeHead&&v.scope===E6_METHOD_SCOPE&&v.service==='PAID_STANDARD'
    &&v.countTokensBilling==='VERIFIED_UPPER_BOUND'&&v.combinedOutputThinkingCap==='VERIFIED_1024'
    &&v.inputNanoUsdPerToken==='300'&&v.outputIncludingThinkingNanoUsdPerToken==='2500'
    &&digits(v.countTokensMaxNanoUsdPerCall)&&sha256(v.evidenceSha256)
    &&v.evidenceKind===(execution==='ACTUAL'?'PRIMARY_ENDPOINT_SPECIFIC':'OFFLINE_TEST_ONLY'),'E6_BILLING_UNKNOWN');
  const perCount=BigInt(v.countTokensMaxNanoUsdPerCall),perGeneration=3000n*300n+1024n*2500n;
  check((perCount+perGeneration)*8n<=50000000n,'E6_BUDGET');
  return {identity,approvalHash:hash(approval),verificationHash:hash(v),perCount,perGeneration};
}

// New private directory, versioned lease and persistent one-shot marker. A hard
// kill leaves the lease; no PID guessing, auto-recovery, resume or marker removal.
export async function withE6RunStore(directory,action){
  const dir=resolve(directory);
  await mkdir(dir,{recursive:true,mode:0o700});
  const st=await lstat(dir);
  check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir
    &&st.uid===process.getuid()&&(st.mode&0o077)===0,'E6_STORE_PERMISSIONS');
  const lock=resolve(dir,'execution.v1.lock'),token=randomUUID();let handle;
  try{handle=await open(lock,'wx',0o600);}catch{fail('E6_BUSY_OR_RECOVERY_REQUIRED');}
  const syncDir=async()=>{const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}};
  const assertLease=async()=>{
    let held;try{held=JSON.parse(await readFile(lock,'utf8'));}catch{fail('E6_LEASE_RECOVERY_REQUIRED');}
    check(held.token===token,'E6_LEASE_OWNERSHIP');
  };
  try{
    await handle.writeFile(JSON.stringify({version:'clear-e6-python-lease.1',token,pid:process.pid}));
    await handle.sync();await handle.close();handle=null;await syncDir();
    const store={
      async claim(identity){
        let once;
        try{once=await open(resolve(dir,'spent.v1.lock'),'wx',0o600);}
        catch{fail('E6_ALREADY_SPENT_OR_RECOVERY_REQUIRED');}
        try{await once.writeFile(JSON.stringify({version:'clear-e6-python-single-run.1',identity}));await once.sync();}
        finally{await once.close();}
        await syncDir();
      },
      async checkpoint(report){
        try{await assertLease();await atomicEvaluationCheckpoint(pathToFileURL(resolve(dir,'summary.v1.json')),report);await assertLease();}
        catch{fail('E6_CHECKPOINT_FAILED');}
      }
    };
    return await action(store);
  }finally{
    if(handle)await handle.close().catch(()=>{});
    await assertLease();await unlink(lock);await syncDir();
  }
}

// All requests (including count) reserve/checkpoint BEFORE reaching transport.
// Fake transport is the only permitted execution in the preparation tests.
export async function runE6Quality({bundle,approval,verification,codeState,day,execution='MOCK',store,
  transportFactory,currentCodeState=()=>codeState,currentDay=()=>day,timeoutMs=45000}){
  bundle=structuredClone(bundle);approval=structuredClone(approval);verification=structuredClone(verification);
  const clearance=validateE6Clearance({bundle,approval,verification,codeState,day,execution});
  const assertCurrent=()=>check(JSON.stringify(currentCodeState())===JSON.stringify(codeState)&&currentDay()===day,'E6_CODE_PIN');
  assertCurrent();
  await store.claim({...clearance.identity,approvalHash:clearance.approvalHash,verificationHash:clearance.verificationHash});
  const report={version:E6_RUN_VERSION,execution,syntheticOnly:true,pins:clearance.identity,
    approvalHash:clearance.approvalHash,verificationHash:clearance.verificationHash,status:'STARTED',
    countCalls:0,generationCalls:0,reservedNanoUsd:'0',attempts:[],
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false};
  const checkpoint=async()=>{try{await store.checkpoint(structuredClone(report));}catch{fail('E6_CHECKPOINT_FAILED');}};
  await checkpoint();let transport;
  const dispatch=async(method,body,reserve)=>{
    assertCurrent();
    validateE6Clearance({bundle,approval,verification,codeState,day,execution});
    const counter=method==='countTokens'?'countCalls':'generationCalls';
    check(report[counter]<8&&BigInt(report.reservedNanoUsd)+reserve<=50000000n,'E6_BUDGET');
    report[counter]++;report.reservedNanoUsd=String(BigInt(report.reservedNanoUsd)+reserve);
    report.status='DISPATCH_RESERVED';await checkpoint();assertCurrent();
    if(!transport)transport=transportFactory();
    check(transport?.execution===execution,'E6_CLEARANCE');
    const controller=new AbortController();let timer;
    try{return await Promise.race([
      Promise.resolve().then(()=>transport.request(bundle.plan.model,method,structuredClone(body),controller.signal)),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('E6_TIMEOUT'));},timeoutMs);})]);}
    finally{clearTimeout(timer);}
  };
  for(const request of bundle.requests){
    const attempt={caseId:request.caseId,requestHash:hash(request),status:'RESERVED'};report.attempts.push(attempt);
    try{
      const counted=await dispatch('countTokens',request.countTokensBody,clearance.perCount);
      check(Number.isSafeInteger(counted?.totalTokens)&&counted.totalTokens>0&&counted.totalTokens<=3000,'E6_INPUT_LIMIT');
      const response=await dispatch('generateContent',request.body,clearance.perGeneration);
      assertCurrent();
      check(response?.modelVersion===bundle.plan.model,'E6_MODEL_PIN');
      const u=response.usageMetadata,tokens={};
      for(const k of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount']){
        check(Number.isSafeInteger(u?.[k])&&u[k]>=0,'E6_OUTPUT_UNKNOWN');tokens[k]=u[k];
      }
      check(tokens.promptTokenCount<=3000&&tokens.candidatesTokenCount+tokens.thoughtsTokenCount<=1024
        &&tokens.totalTokenCount===tokens.promptTokenCount+tokens.candidatesTokenCount+tokens.thoughtsTokenCount,'E6_OUTPUT_LIMIT');
      const candidate=response.candidates?.[0],parts=candidate?.content?.parts;
      check(response.candidates.length===1&&candidate.finishReason==='STOP'&&!response.promptFeedback?.blockReason
        &&Array.isArray(parts)&&parts.length>0&&parts.every(p=>typeof p.text==='string'&&!p.thought),'E6_RESPONSE');
      const text=parts.map(p=>p.text).join('');let raw;
      try{raw=JSON.parse(text);}catch{fail('E6_RESPONSE');}
      const c=bundle.corpus.cases.find(c=>c.caseId===request.caseId),g=bundle.gold.cases.find(g=>g.caseId===request.caseId);
      const assessed=await assessE6QualityResponse(c,raw,g,bundle.corpus.sourceId);
      Object.assign(attempt,{status:assessed.status,responseSha256:sha(text),tokens,
        assessment:{errors:assessed.errors.length,falseHolds:assessed.errors.filter(e=>e.startsWith('FALSE_HOLD:')).length,
          normalControl:g.normalControl}});
    }catch(e){
      if(e?.message==='E6_CHECKPOINT_FAILED')throw e; // Never repeat a failed checkpoint.
      Object.assign(attempt,{status:'UNKNOWN_STOPPED',code:errorCode(e)});report.status='UNKNOWN_STOPPED';
      await checkpoint();return report;
    }
    report.status='CASE_FINISHED';await checkpoint();
  }
  report.status='FINISHED';
  report.aggregate={cases:report.attempts.length,passed:report.attempts.filter(a=>a.status==='PASS').length,
    needsImprovement:report.attempts.filter(a=>a.status==='NEEDS_IMPROVEMENT').length,
    normalControls:report.attempts.filter(a=>a.assessment.normalControl).length,
    falseHolds:report.attempts.reduce((n,a)=>n+a.assessment.falseHolds,0)};
  await checkpoint();return report;
}
