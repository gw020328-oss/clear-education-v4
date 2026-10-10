import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateSchema} from './validate-schema.mjs';
import {safetyGate,criticalFields} from './safety-gate.mjs';
import {inputPacket} from './input-packet.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const json=p=>JSON.parse(read(p));
const lines=p=>read(p).trim().split('\n').map(JSON.parse);
const rows=lines('DATASET.jsonl'),refs=lines('REFERENCE_LABELS.jsonl'),schema=json('schemas/output.schema.json');
const checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
check('12 operator-distinct sources',rows.length===12&&new Set(rows.map(x=>x.operatorId)).size===12);
check('unique sourceIds and no duplicate selected texts',new Set(rows.map(x=>x.sourceId)).size===12&&new Set(rows.map(x=>x.spans.map(s=>s.text).join('|'))).size===12);
check('frozen dev split',eq(rows.filter(x=>x.split==='dev').map(x=>x.sourceId),['R03','R05','R10','R11']));
check('frozen eval split',eq(rows.filter(x=>x.split==='eval').map(x=>x.sourceId),['R01','R02','R04','R06','R07','R08','R09','R12']));
check('no operator leakage',!rows.some(a=>rows.some(b=>a.operatorId===b.operatorId&&a.split!==b.split)));
check('types 10/1/1, evaluation core only',eq(['CONDITIONAL_SERVICE','SELF_COMMITMENT','GENERAL_REFUND'].map(t=>rows.filter(r=>r.sourceType===t).length),[10,1,1])&&rows.filter(r=>r.split==='eval').every(r=>r.sourceType==='CONDITIONAL_SERVICE'));
check('zero synthetic sources',rows.every(r=>r.synthetic===false));
check('references match sources exactly',eq(refs.map(r=>r.sourceId),rows.map(r=>r.sourceId)));
for(const row of rows){
 const ref=refs.find(x=>x.sourceId===row.sourceId),out=ref.output,ids=new Set(row.spans.map(s=>s.spanId));
 check(row.sourceId+' source metadata',row.checkedAt==='2026-09-14'&&row.access.httpStatus==='200'&&row.access.url===row.officialUrl&&!!row.documentTitle&&!!row.version&&row.access.bytes>0&&[row.access.rawSha256,row.access.normalizedTextSha256,row.flattenedTextSha256].every(s=>/^[a-f0-9]{64}$/.test(s)));
 check(row.sourceId+' spans hash and unique positions',ids.size===row.spans.length&&row.spans.every(s=>s.text&&s.locator&&sha(s.text)===s.sha256&&s.startCodePoint>=0&&s.endCodePoint-s.startCodePoint===Array.from(s.text).length));
 check(row.sourceId+' output schema',validateSchema(out,schema).length===0,validateSchema(out,schema));
 check(row.sourceId+' reference provenance',ref.labelStatus==='연구자 작성 임시 참조값'&&ref.authorship.includes('검토 없음'));
 check(row.sourceId+' field grounding or unknown reason',criticalFields.every(f=>out[f].reason?.length>0&&(out[f].value===null||out[f].spanIds.length>0)&&out[f].spanIds.every(id=>ids.has(id)))&&out.evidenceSpans.every(x=>ids.has(x.spanId)));
 check(row.sourceId+' condition labels cover spans',eq(ref.conditionLabels.map(x=>x.spanId),row.spans.map(s=>s.spanId))&&ref.conditionLabels.every(x=>criticalFields.includes(x.field)&&!!x.reason));
 check(row.sourceId+' clarification coverage',criticalFields.filter(f=>out[f].status==='CLARIFICATION_REQUIRED').every(f=>out.clarificationQuestions.some(q=>q.field===f&&q.question.length>15)));
 check(row.sourceId+' no invented executable and aggregate rule',out.executable===false&&out.classification===(ref.conditionLabels.some(x=>x.status==='UNSUPPORTED')?'UNSUPPORTED':'CLARIFICATION_REQUIRED'));
 const packet=inputPacket(row);
 check(row.sourceId+' blind equal input packet',eq(Object.keys(packet),['sourceId','documentTitle','officialUrl','language','spans'])&&packet.spans.every(s=>eq(Object.keys(s),['spanId','text','locator']))&&eq(inputPacket(row),packet));
 check(row.sourceId+' gate keeps provisional reference blocked',safetyGate(out,packet,schema).executable===false);
}
check('case labels 10/2/0',eq(['UNSUPPORTED','CLARIFICATION_REQUIRED','SUPPORTED'].map(c=>refs.filter(r=>r.output.classification===c).length),[10,2,0]));
// Deterministic technical mutations. These are not public natural-language cases.
const base=refs[0].output,clone=v=>JSON.parse(JSON.stringify(v));
for(const [name,mutate] of [['missing field',v=>delete v.recipient],['extra field',v=>v.extra=true],['bad boolean type',v=>v.executable='true'],['confidence out of range',v=>v.confidence=2]]){
 const v=clone(base);mutate(v);check('schema mutation: '+name,validateSchema(v,schema).length>0);
}
const dangerous=clone(base);dangerous.executable=true;
check('A does not claim semantic safety',validateSchema(dangerous,schema).length===0);
check('C blocks structurally valid unsafe proposal',!safetyGate(dangerous,inputPacket(rows[0]),schema).executable);
const wrongId=clone(base);wrongId.sourceId='R99';
check('C detects source mismatch',safetyGate(wrongId,inputPacket(rows[0]),schema).errors.some(e=>e.rule==='SOURCE_MISMATCH'));
const missingSpan=clone(base);missingSpan.evidenceSpans.push({field:'refundAmount',spanId:'R99-S1'});
check('C detects invented span',safetyGate(missingSpan,inputPacket(rows[0]),schema).errors.some(e=>e.rule==='UNKNOWN_SPAN'));
// Synthetic policy wiring fixture only; never included in DATASET or positive-case metrics.
const profile=clone(base);
profile.sourceId='R99';profile.classification='SUPPORTED';profile.executable=true;
profile.unsupportedConditions=[];profile.clarificationQuestions=[];
for(const f of criticalFields)Object.assign(profile[f],{status:'SUPPORTED',spanIds:['R99-S1'],reason:null});
Object.assign(profile.refundAmount,{value:'50',unit:'TEST',basis:'FIXED'});
Object.assign(profile.recipient,{value:'0x'+'1'.repeat(40),kind:'ADDRESS'});
Object.assign(profile.approvalActor,{value:'0x'+'2'.repeat(40),kind:'ISSUER_ADDRESS'});
Object.assign(profile.requiredEvidence,{value:['SUBMISSION_0','SUBMISSION_1','SUBMISSION_2','SUBMISSION_3'],kind:'SIGNED_SUBMISSIONS'});
Object.assign(profile.completionDeadline,{value:'2027-01-01T00:00:00Z',rawText:'2027-01-01T00:00:00Z',timeZone:'UTC'});
Object.assign(profile.claimDeadline,{value:'2027-01-02T00:00:00Z',rawText:'2027-01-02T00:00:00Z',timeZone:'UTC'});
Object.assign(profile.exceptions,{value:[],completeness:'EXPLICIT_NONE'});
profile.evidenceSpans=criticalFields.map(field=>({field,spanId:'R99-S1'}));
check('synthetic policy wiring is not constant false',safetyGate(profile,{sourceId:'R99',spans:[{spanId:'R99-S1',text:'Synthetic fixed profile fixture, not a public refund source.'}]},schema).executable);
check('locator preserves actual heading',inputPacket(rows[4]).spans[2].locator==='1대1 보이스케어 참여 방법 / 1');
const previous=json('artifacts/prior-file-hashes.json');
const changed=Object.entries(previous).filter(([p,h])=>!fs.existsSync(path.join(root,'..',p))||sha(fs.readFileSync(path.join(root,'..',p)))!==h).map(([p])=>p);
check('previous 276 files preserved',Object.keys(previous).length===276&&changed.length===0,changed);
const pre=process.argv.includes('--pre-freeze');
if(!pre){
 const manifest=json('SHA256_MANIFEST.json'),receipt=json('FREEZE_RECEIPT.json');
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.relative(root,path.join(dir,e.name))]);
 const excluded=new Set(['SHA256_MANIFEST.json','FREEZE_RECEIPT.json','artifacts/read-only-checks.json']);
 check('manifest covers all frozen files',eq(Object.keys(manifest.files).sort(),walk(root).filter(p=>!excluded.has(p)).sort()));
 for(const [p,h] of Object.entries(manifest.files))check('frozen SHA256 '+p,sha(fs.readFileSync(path.join(root,p)))===h);
 check('manifest receipt hash',sha(read('SHA256_MANIFEST.json'))===receipt.manifestSha256);
}
const cacheDirs=process.argv.slice(2).filter(p=>!p.startsWith('--'));
let sourceCacheStatus='NOT_RUN: provide original temporary cache directories';
if(cacheDirs.length){
 const sources=new Map();
 for(const dir of cacheDirs)for(const a of JSON.parse(fs.readFileSync(path.join(dir,'access.json'),'utf8')))sources.set(a.url,{dir,a});
 for(const row of rows){
  const found=sources.get(row.officialUrl);
  if(!found){check(row.sourceId+' raw source cache',false,'missing');continue;}
  const {dir,a}=found,text=fs.readFileSync(path.join(dir,a.id+'.txt'),'utf8'),flat=text.split(/\s+/u).filter(Boolean).join(' ');
  check(row.sourceId+' raw source cache',sha(fs.readFileSync(path.join(dir,a.id+'.html')))===row.access.rawSha256&&sha(text)===row.access.normalizedTextSha256&&sha(flat)===row.flattenedTextSha256);
  check(row.sourceId+' exact quote in fetched source',row.spans.every(s=>Array.from(flat).slice(s.startCodePoint,s.endCodePoint).join('')===s.text));
 }
 sourceCacheStatus='EXECUTED';
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),mode:pre?'PRE_FREEZE':'FROZEN',passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,sourceCacheStatus,counts:{sources:12,operators:12,dev:4,eval:8,conditional:10,selfCommitment:1,generalRefund:1,supportedCases:0,unsupportedCases:10,clarificationCases:2,publicSyntheticCases:0,sourceSpans:rows.reduce((n,r)=>n+r.spans.length,0),schemaMutationFixtures:4,policyDiagnosticFixtures:4,syntheticPolicyWiringFixtures:1,previousFiles:Object.keys(previous).length},checks},null,2));
if(checks.some(x=>!x.pass))process.exitCode=1;
