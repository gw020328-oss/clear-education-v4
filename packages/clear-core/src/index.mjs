import {createHash} from 'node:crypto';
const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value; };
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
// JSON.stringify drops undefined, sparse slots and non-index array properties.
// Reject those before hashing or cloning; do not invoke getters/toJSON hooks.
function plainJson(value, depth=0) {
 check(depth<=32, 'DTO_JSON_DEPTH');
 if(value===null || typeof value==='string' || typeof value==='boolean') return;
 if(typeof value==='number') {check(Number.isFinite(value) && !Object.is(value,-0),'DTO_JSON_NUMBER');return;}
 check(value && typeof value==='object','DTO_JSON_VALUE');
 const array=Array.isArray(value),keys=Reflect.ownKeys(value);
 check(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype),'DTO_JSON_PROTOTYPE');
 if(array) {
  check(value.length<=4096 && keys.length===value.length+1 && keys.includes('length'),'DTO_JSON_ARRAY');
  for(let i=0;i<value.length;i++) check(Object.hasOwn(value,String(i)),'DTO_JSON_ARRAY');
 }
 for(const key of keys) {
  if(array && key==='length') continue;
  check(typeof key==='string' && (!array || /^(0|[1-9][0-9]*)$/.test(key) && Number(key)<value.length),'DTO_JSON_KEYS');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  check(descriptor.enumerable && Object.hasOwn(descriptor,'value'),'DTO_JSON_DESCRIPTOR');
  plainJson(descriptor.value,depth+1);
 }
}
export const hash = value => {plainJson(value);return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');};
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
export function sourceClauses(sourceText) {
 check(typeof sourceText === 'string' && sourceText.length > 0 && sourceText.length <= 4096 && sourceText.isWellFormed(), 'SOURCE_INVALID');
 const clauses = []; for (const match of sourceText.matchAll(/[^;\n]+/gu)) {
  const text = match[0].trim(); if (!text) continue;
  const start = match.index + match[0].indexOf(text);
  clauses.push({id:`clause-${clauses.length+1}`,start,end:start+text.length,text});
 }
 check(clauses.length > 0 && clauses.length <= 16,'CLAUSE_LIMIT');
 return freeze(clauses);
}
export function structureSynthetic(sourceText) {
 const clauses=sourceClauses(sourceText);
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
// Server-side relation guard for model proposals. The model is instructed to flag
// these, but its SUPPORTED label is not trusted: one clause may carry only one
// positive required condition. Alternatives, substitutions, negation, thresholds,
// deadlines, optional items, several conditions or unsupported measures cannot be
// expressed by that contract, so they are held for review and never become
// required conditions. Canonical grammar sentences are exempt (closed grammar).
const CONDITION_WORD = '(?:과제|숙제|강의|수업|활동|영상|회고|후기|성찰|리플렉션|해커|헤커|hackerrank|assignment|lecture|reflection)';
const CAPABILITY_HINTS = [
 ['HACKERRANK_CERTIFICATE_HOLDING.1', [/hackerrank|해커\s*랭크|헤커\s*랭크/iu]],
 ['REFLECTION_REQUIRED_TOPICS.1', [/회고|성찰|리플렉션|reflection|후기.*(?:작성|쓰|적|남기|기록|게시|올리|블로그)/iu]],
 ['MOODLE_ASSIGNMENT_SUBMISSION.1', [/과제|숙제|assignment/iu, /제출|내고|내서|내야|내기|냅니다|내면|낸다|냈|올리|업로드|submit/iu]],
 ['MOODLE_ACTIVITY_COMPLETION.1', [/강의|수업|활동|영상|lecture|activity/iu, /완료|이수|수강|듣|들어|마치|완주|끝|complete/iu]]
];
const GUARDS = [
 ['UNSUPPORTED_MEASURE', /출석|출결|참석률|참여율|수강률|시청률|시청\s*시간|정답률|점수|점\s*이상|등급|만점|취업|면접/u],
 ['OPTIONAL', /\(\s*선택\s*\)|선택\s*사항|선택적|선택(?:입니다|이다|임)|optional/iu],
 ['ALTERNATIVE', new RegExp(`또는|혹은|거나|택\\s*1|택일|중\\s*(?:하나|한\\s*가지|1\\s*개)|\\bor\\b|(?:이)?나\\s+(?=${CONDITION_WORD})`, 'iu')],
 ['SUBSTITUTE', /대신|대체|갈음|\binstead\b/iu],
 ['NEGATION', /않|(?<!빠짐)없이|없어도|(?:^|\s)안\s+(?:들|듣|하|해|내|보|받|제출|수강|완료|이수|작성)|필요\s*(?:하지\s*)?없|제외|불필요|면제|아니|금지|생략|미(?:제출|수강|완료|이수)|\bnot\b|\bwithout\b|\bexcept\b/iu],
 // A count must start outside another word (포함한/상세 are not counts).
 // Once a numeral + unit prefix exists, hold regardless of the suffix. This
 // detects possible lost quantities, not Korean morphology; ambiguous noun
 // prefixes after a genuine numeral are held too. No particle allowlist.
 ['THRESHOLD', /\d+(?:\.\d+)?\s*(?:%|퍼센트|회|번|개|건|편|시간|분)|(?<![\p{L}\p{N}])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:회|번|개|건|편|시간|분)|이상|이하|미만|초과|최소|최대|at\s+least|more\s+than|less\s+than/iu],
 // '끝까지'·'마지막까지' 는 기한이 아니다. 날짜·시각·이름 붙은 시점 뒤의 '까지' 만 본다.
 ['DEADLINE', /\d+\s*월\s*\d+\s*일|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+\s*(?:일|시)\s*까지|(?:[월화수목금토일]요일|오늘|내일|이번\s*주|다음\s*주|주말|월말|수료\s*전|종강\s*전)\s*까지|기한|마감|deadline/iu]
];
const GUARD_QUESTION = freeze({
 UNSUPPORTED_MEASURE: '출석률·점수 같은 기준은 자동 검증을 지원하지 않습니다. 정책 확정 전 운영자 처리가 필요합니다.',
 OPTIONAL: '선택 사항으로 보입니다. 필수 조건으로 바꾸지 않았습니다. 환급 조건인지 확인해 주세요.',
 ALTERNATIVE: '조건 중 하나만 채우면 되는 문장(또는)으로 보입니다. 한 조항에 필수 조건 하나만 표현할 수 있어 확정하지 않았습니다. 요구할 조건을 정해 원문을 고쳐 주세요.',
 SUBSTITUTE: '한 조건을 다른 조건으로 바꾸는 문장(대신)으로 보입니다. 대체 관계는 표현할 수 없어 확정하지 않았습니다. 최종 조건을 정해 원문을 고쳐 주세요.',
 NEGATION: '부정·제외 표현이 있습니다. 필수 조건으로 바꾸지 않았습니다. 원문의 뜻을 확인해 주세요.',
 THRESHOLD: '수치·횟수 기준이 있습니다. 지원 조건은 지정 항목의 완료·제출 여부만 봐서 기준을 옮길 수 없습니다. 기준을 확인해 주세요.',
 DEADLINE: '기한 표현이 있습니다. 지원 조건은 기한을 검사하지 않아 그대로 옮길 수 없습니다. 기한 처리를 확인해 주세요.',
 MULTIPLE_CONDITIONS: '한 조항에 조건이 여럿 있습니다. 조항마다 조건 하나가 되도록 줄이나 세미콜론으로 나눠 주세요.',
 CAPABILITY_CONTRADICTION: '모델이 고른 조건 종류가 문장 표현과 맞지 않습니다. 조건 종류를 확인해 주세요.'
});
export function capabilityHints(text) {
 return CAPABILITY_HINTS.filter(([, patterns]) => patterns.every(re => re.test(text))).map(([capability]) => capability);
}
// Kinds that stop a model-SUPPORTED clause from becoming an executable condition.
export function clauseGuardKinds(text, capability) {
 if (grammar.some(re => re.test(text))) return [];
 const kinds = GUARDS.filter(([, re]) => re.test(text)).map(([kind]) => kind);
 // A lecture-review noun phrase names the review's subject, not a second
 // completion obligation. Separate verbs such as 수강하고 remain visible.
 const obligations = text.replace(/(?:강의|수업|활동|영상)\s+(?:(?:수강|시청)\s+)?(?=후기)/gu, '');
 const hints = capabilityHints(obligations);
 // In this narrow relation modifier the first noun describes the target. Keep
 // any subsequent targets visible, e.g. 관련된 활동 A와 활동 B still counts two.
 const targets = obligations.replace(/(?:강의|수업|활동|영상)(?:와|과)\s+관련된\s+/gu, '');
 const repeated = /(?:와|과)\s|및|그리고|,|하고/u.test(targets) && CAPABILITY_HINTS.some(([cap, [noun]]) =>
  hints.includes(cap) && [...targets.matchAll(new RegExp(noun.source, `${noun.flags}g`))].length > 1);
 if (hints.length >= 2 || repeated) kinds.push('MULTIPLE_CONDITIONS');
 else if (hints.length === 1 && capability && hints[0] !== capability) kinds.push('CAPABILITY_CONTRADICTION');
 return kinds;
}
const reviewedDrafts = new WeakSet();
export function reviewModelProposal(sourceText, rows, reviewedHash) {
 plainJson(rows);
 const clauses = sourceClauses(sourceText);
 check(Array.isArray(rows) && rows.length === clauses.length, 'MODEL_CLAUSE_COVERAGE');
 const conditions = [], questions = [], guards = [];
 rows.forEach((row, index) => {
  exact(row, ['quote','start','end','status','capability','question'], 'MODEL_CLAUSE_FIELDS');
  const clause = clauses[index];
  check(row.quote === clause.text && row.start === clause.start && row.end === clause.end, 'MODEL_SOURCE_SPAN');
  if (row.status !== 'SUPPORTED') {
   check(['UNSUPPORTED','NEEDS_CLARIFICATION'].includes(row.status) && row.capability === null
    && typeof row.question === 'string' && row.question.trim().length > 0 && row.question.length <= 240, 'MODEL_QUESTION');
   questions.push({clauseId: clause.id, reason: row.status, question: row.question});
   return;
  }
  const tool = TOOL_MANIFEST.find(entry => entry.capability === row.capability);
  check(tool && row.question === null, 'MODEL_CAPABILITY');
  const known = grammar.findIndex(pattern => pattern.test(clause.text));
  check(known < 0 || TOOL_MANIFEST[known] === tool, 'MODEL_CAPABILITY_MISMATCH');
  // The model said SUPPORTED. Hold it if the clause cannot be one required condition.
  const kinds = clauseGuardKinds(clause.text, tool.capability);
  if (kinds.length) {
   guards.push({clauseId: clause.id, kinds, modelStatus: 'SUPPORTED', modelCapability: tool.capability});
   questions.push({clauseId: clause.id, reason: kinds.includes('UNSUPPORTED_MEASURE') ? 'UNSUPPORTED' : 'NEEDS_CLARIFICATION',
    question: GUARD_QUESTION[kinds[0]]});
   return;
  }
  if (conditions.some(condition => condition.capability === tool.capability)) {
   questions.push({clauseId: clause.id, reason: 'NEEDS_CLARIFICATION', question: '중복 조건의 적용 범위를 확인해 주세요.'});
   return;
  }
  conditions.push({id: `condition-${conditions.length+1}`, clauseId: clause.id, capability: tool.capability, target: tool.target});
 });
 const proposalHash = hash({sourceText, rows});
 const status = questions.some(question => question.reason === 'UNSUPPORTED') ? 'UNSUPPORTED'
  : questions.length ? 'NEEDS_CLARIFICATION' : reviewedHash === proposalHash ? 'READY' : 'OPERATOR_REVIEW_REQUIRED';
 // Preserve the proposal before server holds, without freezing caller-owned rows.
 const modelRows = rows.map(row => ({...row}));
 const draft = signed({version: 'clear-preview-model-draft.2', executionMode: 'MODEL_PROPOSAL',
  sourceText, sourceHash: hash(sourceText), proposalHash, modelRows, clauses, conditions, questions, guards, status});
 reviewedDrafts.add(draft);
 return draft;
}
function validateDraft(draft) {
 check(draft && (reviewedDrafts.has(draft) || hash(draft) === hash(structureSynthetic(draft.sourceText))), 'DRAFT_INVALID');
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
  plainJson(plan);
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
 plainJson(plan);plainJson(draft);
 const validation=validatePlan(plan,draft);check(validation.ok,validation.errors[0]);
 plan=structuredClone(plan);draft=structuredClone(draft);
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
