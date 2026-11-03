import {createHash} from 'node:crypto';
const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value; };
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = code => {throw Object.assign(new Error(code), {code});};
const check = (ok, code) => {if (!ok) fail(code);};
const exact = (v, keys, code) => check(v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k)), code);
const signed = v => freeze({...v, [v.steps ? 'planHash' : 'draftHash']:hash(v)});
export const TOPICS = freeze(['work-performed','problem-solving-process','learning-takeaway']);
export const TOOL_MANIFEST = freeze([
 {tool:'moodle.activity.public',version:'1',capability:'MOODLE_ACTIVITY_COMPLETION.1',target:'python-intro',input:'clause-target.1',output:'public-observation.1',effect:'READ_PUBLIC_FIXTURE'},
 {tool:'moodle.assignment.public',version:'1',capability:'MOODLE_ASSIGNMENT_SUBMISSION.1',target:'python-assignment',input:'clause-target.1',output:'public-observation.1',effect:'READ_PUBLIC_FIXTURE'},
 {tool:'reflection.topics.public',version:'1',capability:'REFLECTION_REQUIRED_TOPICS.1',target:'python-reflection',input:'clause-target.1',output:'public-observation.1',effect:'READ_PUBLIC_FIXTURE'},
 {tool:'hackerrank.certificate.public',version:'1',capability:'HACKERRANK_CERTIFICATE_HOLDING.1',target:'python-basic',input:'clause-target.1',output:'public-observation.1',effect:'READ_PUBLIC_FIXTURE'}
]);
// A deliberately closed, anchored grammar. Unrecognized clauses never become executable AST.
const grammar = [
 /^(?:Moodle 활동 완료|Moodle 활동을 완료한다|Moodle 활동 완료가 필요하다)$/u,
 /^(?:Moodle 과제 제출|Moodle 과제를 제출한다|Moodle 과제 제출이 필요하다)$/u,
 /^(?:회고에 수행 내용, (?:문제해결|확인) 과정, 배운 점 포함|회고에는 수행 내용과 (?:문제해결|확인) 과정 및 배운 점이 필요하다)$/u,
 /^(?:HackerRank Python \(Basic\) 인증서 보유|HackerRank Python \(Basic\) 인증서를 보유한다)$/u
];
export function structureSynthetic(sourceText) {
 check(typeof sourceText === 'string' && sourceText.length > 0 && sourceText.length <= 4096 && sourceText.isWellFormed(), 'SOURCE_INVALID');
 const clauses = []; for (const match of sourceText.matchAll(/[^;\n]+/gu)) {
  const text = match[0].trim(); if (!text) continue;
  const start = match.index + match[0].indexOf(text);
  clauses.push({id:`clause-${clauses.length+1}`,start,end:start+text.length,text});
 }
 check(clauses.length > 0 && clauses.length <= 16,'CLAUSE_LIMIT');
 const conditions = [], questions = [];
 for (const c of clauses) {
  const index = grammar.findIndex(re => re.test(c.text));
  if (index < 0) {questions.push({clauseId:c.id,reason:/성실|적절|충분|참여/u.test(c.text)?'NEEDS_CLARIFICATION':'UNSUPPORTED'}); continue;}
  const m = TOOL_MANIFEST[index];
  if (conditions.some(x=>x.capability===m.capability)) {questions.push({clauseId:c.id,reason:'NEEDS_CLARIFICATION'});continue;}
  conditions.push({id:`condition-${conditions.length+1}`,clauseId:c.id,capability:m.capability,target:m.target});
 }
 return signed({version:'clear-preview-draft.1',executionMode:'SYNTHETIC_RULES',actualModelCall:false,sourceText,sourceHash:hash(sourceText),clauses,conditions,questions,
  status:questions.some(q=>q.reason==='UNSUPPORTED')?'UNSUPPORTED':questions.length?'NEEDS_CLARIFICATION':'READY'});
}
function validateDraft(draft) {
 check(draft && hash(draft) === hash(structureSynthetic(draft.sourceText)), 'DRAFT_INVALID');
 check(draft.status === 'READY', 'DRAFT_NOT_READY');
}
export function buildPlan(draft) {
 validateDraft(draft);
 return signed({version:'clear-preview-plan.1',executionMode:'PUBLIC_SYNTHETIC',sourceHash:draft.sourceHash,draftHash:draft.draftHash,
  steps:draft.conditions.map((c,i)=>{const m=TOOL_MANIFEST.find(m=>m.capability===c.capability);return {
   id:`step-${i+1}`,tool:m.tool,version:m.version,conditionId:c.id,input:{clauseId:c.clauseId,target:c.target},dependsOn:[],output:m.output,onFailure:'STOP'};})});
}
export function validatePlan(plan, draft) {
 try {
  validateDraft(draft);
  exact(plan,['version','executionMode','sourceHash','draftHash','steps','planHash'],'PLAN_FIELDS');
  check(plan.version==='clear-preview-plan.1' && plan.executionMode==='PUBLIC_SYNTHETIC','PLAN_MODE');
  check(plan.sourceHash===draft.sourceHash && plan.draftHash===draft.draftHash,'PLAN_SOURCE_BINDING');
  check(Array.isArray(plan.steps) && plan.steps.length>0 && plan.steps.length<=4,'STEP_LIMIT');
  const seen=new Set(), covered=new Set();
  for(const s of plan.steps) {
   exact(s,['id','tool','version','conditionId','input','dependsOn','output','onFailure'],'STEP_FIELDS');
   check(typeof s.id==='string' && /^step-[1-4]$/.test(s.id) && !seen.has(s.id),'STEP_ID');seen.add(s.id);
   const m=TOOL_MANIFEST.find(m=>m.tool===s.tool && m.version===s.version);check(m,'TOOL_NOT_ALLOWED');
   const c=draft.conditions.find(c=>c.id===s.conditionId);check(c && c.capability===m.capability && !covered.has(c.id),'CONDITION_MAPPING');covered.add(c.id);
   exact(s.input,['clauseId','target'],'INPUT_FIELDS');
   check(s.input.clauseId===c.clauseId && s.input.target===c.target && c.target===m.target,'INPUT_BINDING');
   check(Array.isArray(s.dependsOn) && s.dependsOn.length===0,'DEPENDENCY_UNSUPPORTED');
   check(s.output===m.output,'OUTPUT_SCHEMA');check(s.onFailure==='STOP','FAILURE_POLICY');
  }
  check(covered.size===draft.conditions.length,'CONDITION_MISSING');
  const {planHash,...body}=plan;check(planHash===hash(body),'PLAN_HASH');
  return freeze({ok:true,errors:[],sourceHash:draft.sourceHash,planHash});
 } catch(e) {return freeze({ok:false,errors:[e.code??'INVALID_INPUT'],sourceHash:null,planHash:null});}
}
// Public invented records, not cached production observations or signatures.
const PUBLIC_RECORDS=freeze({
 'python-intro':{kind:'ACTIVITY',completion:'COMPLETED',tracking:'AUTOMATIC'},
 'python-assignment':{kind:'ASSIGNMENT',status:'submitted',gradingRequired:false},
 'python-reflection':{kind:'REFLECTION',text:'수행: 반복문을 구현했다. 확인: 빈 목록 입력으로 동작을 확인했다. 배움: 경계값 검사가 필요함을 배웠다.',quotes:['반복문을 구현했다.','빈 목록 입력으로 동작을 확인했다.','경계값 검사가 필요함을 배웠다.']},
 'python-basic':{kind:'CERTIFICATE',name:'Python (Basic)',issuerStatus:'test_passed',signatureVerified:false}
});
export function executePublicDemo(plan,draft) {
 // Snapshot and validate again at dispatch; no injected executor/callback or arbitrary URL.
 plan=structuredClone(plan);draft=structuredClone(draft);
 const validation=validatePlan(plan,draft);check(validation.ok,validation.errors[0]);
 const observations=plan.steps.map(s=>{
  const r=PUBLIC_RECORDS[s.input.target];let met=false, evidence=[];
  if(r.kind==='ACTIVITY') met=r.completion==='COMPLETED'&&r.tracking==='AUTOMATIC';
  if(r.kind==='ASSIGNMENT') met=r.status==='submitted'&&r.gradingRequired===false;
  if(r.kind==='CERTIFICATE') met=r.name==='Python (Basic)'&&r.issuerStatus==='test_passed';
  if(r.kind==='REFLECTION') {evidence=r.quotes.map((quote,i)=>({topic:TOPICS[i],quote,start:r.text.indexOf(quote),end:r.text.indexOf(quote)+quote.length}));met=evidence.every(e=>e.start>=0&&r.text.slice(e.start,e.end)===e.quote);}
  return {stepId:s.id,conditionId:s.conditionId,tool:s.tool,state:met?'MET_IN_PUBLIC_FIXTURE':'UNKNOWN',record:structuredClone(r),recordHash:hash(r),evidence,
   authenticity:'SYNTHETIC_UNVERIFIED',signatureVerified:false};
 });
 return freeze({version:'clear-preview-result.1',executionMode:'PUBLIC_SYNTHETIC',actualModelCall:false,sourceHash:draft.sourceHash,planHash:plan.planHash,hashStatus:'VERIFIED',scope:'PRECONFIGURATION_ONLY',
  automaticEligibility:false,paymentAllowed:false,calls:plan.steps.map(s=>s.tool),observations});
}
