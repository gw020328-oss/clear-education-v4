import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCompiler,H} from '../policy-binding/core.mjs';
import {validate} from '../diagnostic/schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),project=path.dirname(root.slice(0,-1));
const read=p=>fs.readFileSync(root+p,'utf8'),json=p=>JSON.parse(read(p)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const checks=[],check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const selected=json('artifacts/SELECTED_RUNS.json');
for(const [name,expected]of [['stage9',160],['stage10-freeze',73],['stage10-run',167]]){const r=json('artifacts/precheck/'+name+'.json');check(name+' prior precheck',r.passed===expected&&r.failed===0);}
for(const tag of ['BINDING','AI','SCORER','SCORER_V3_1','IMPLEMENTATION']){
 const p='artifacts/'+tag+'_FREEZE.json',m=json(p),receipt=json('artifacts/'+tag+'_FREEZE_RECEIPT.json');check(tag+' receipt',sha(read(p))===receipt.sha256);
 for(const [f,h]of Object.entries(m.files))check(tag+' '+f,sha(read(f))===h);
}
const old=json('artifacts/precheck/prior-files.json').files,changed=[];
for(const [f,h]of Object.entries(old))if(!fs.existsSync(path.join(project,f))||sha(fs.readFileSync(path.join(project,f)))!==h)changed.push(f);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>['node_modules','.git','stage11'].includes(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.relative(project,path.join(dir,e.name))]);
const extra=walk(project).filter(p=>!Object.hasOwn(old,p));check('old files byte preserved',changed.length===0&&extra.length===0,{count:Object.keys(old).length,changed,extra});
const binding=json(selected.binding+'/results.json'),expected=json('test/EXPECTED.json');
check('binding frozen 4 normal / 24 negatives',binding.passed===28&&binding.failed===0&&binding.covered&&[...expected.normal,...expected.blocked].every(id=>binding.results.some(r=>r.id===id&&r.pass)));
check('exact stage10 regression reproduced then blocked',binding.results.find(r=>r.id==='stage10-F13-kind-only')?.detail.originalGateAfterKindOnly===true&&binding.results.find(r=>r.id==='stage10-F13-kind-only')?.detail.newCompilerBlocked===true);
check('two independent recipients and local payments',binding.localEvm.rows.length===2&&binding.localEvm.rows.every(r=>r.paid.paidUnits==='50000000'&&r.replayBlocked)&&new Set(binding.localEvm.rows.map(r=>r.recipient)).size===2);
for(const row of binding.localEvm.rows){const e=row.publicEvidence,p=createCompiler(e.trust)(e.bundle,e.bundle.enrollment.enrolledAt);check('saved signatures and terms '+row.recipient,p.termsHash===row.paid.termsHash&&p.termsHash===H(p.commitment));}
check('generated secrets exact report scan',binding.secretAudit.exactMatches===0&&binding.secretAudit.generatedSecretsCompared>0);
const prior=json(selected.prior+'/summary.json'),comparison=json(selected.prior+'/stage7-artifacts/comparison-results.json');
check('existing 80 regression',prior.prior.totalPassed===80&&prior.prior.results.every(r=>r.passed)&&!prior.prior.sourceModified);
check('stage7 21 tests',prior.results.find(r=>r.command==='stage7/run-tests.mjs')?.summary.includes('# pass 21')&&prior.results.every(r=>r.exitCode===0));
check('17 comparison scenarios',comparison.summary.protocolMatches===17&&comparison.summary.centralSuccess===10&&comparison.summary.onchainSuccess===9&&comparison.summary.secretMatches===0);
for(const id of ['main-down','issuer-down','both-down','executor-down','chain-down','ui-down']){const r=comparison.results.find(r=>r.id===id);check(id+' actual process stop',r.processStops.length>0&&r.processStops.every(s=>Number.isInteger(s.pid)&&s.exitCode===0&&s.reachableAfterExit===false));}
const diagnostic=json(selected.diagnostic+'/summary.json'),schema=json('diagnostic/schema.json'),tasks=read('diagnostic/tasks.jsonl').trim().split('\n').map(JSON.parse);
check('neutral tasks 10 separate from refunds',tasks.length===10&&new Set(tasks.map(x=>x.taskId)).size===10&&tasks.every(t=>t.dataKind==='SYNTHETIC_NEUTRAL_FORMAT_TASK'));
let records=[];
for(const t of tasks)for(const arm of ['B','C']){
 const r=json(selected.diagnostic+'/'+t.taskId+'-'+arm+'.json'),request=r.result.request,input={taskId:t.taskId,spans:t.spans};records.push(r);
 check(t.taskId+' '+arm+' frozen input settings schema',r.inputHash===sha(JSON.stringify(input))&&JSON.stringify(request.format)===JSON.stringify(schema)&&JSON.stringify(request.options)===JSON.stringify(diagnostic.model.options)&&request.model===diagnostic.model.name&&request.messages[0].content===read('diagnostic/'+arm+'.txt')&&request.messages[1].content===JSON.stringify(input));
 const parsed=JSON.parse(r.result.raw.message.content);check(t.taskId+' '+arm+' raw no repair schema',r.schemaValid===(validate(parsed,schema).length===0)&&JSON.stringify(parsed)===JSON.stringify(r.parsed)&&r.result.raw.done===true);
}
for(const arm of ['B','C'])check(arm+' measured counts',diagnostic.arms[arm].valid===records.filter(r=>r.arm===arm&&r.schemaValid).length&&diagnostic.arms[arm].calls===10);
check('no strong semantic inference',diagnostic.model.strong===false&&diagnostic.semanticStatus==='BLOCKED_STRONG_BASELINE'&&diagnostic.semanticCalls===0&&diagnostic.neutralCalls===20&&diagnostic.smokeCalls===2);
const scorer=json(selected.scorer+'/results.json');check('scorer 29 fixtures',scorer.passed===29&&scorer.failed===0&&scorer.modelCalls===0);
const allStage11=[];function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else allStage11.push(p);}}visit(root);
const sensitive=[];for(const p of allStage11.filter(p=>p.endsWith('.json')||p.endsWith('.jsonl'))){const content=fs.readFileSync(p,'utf8');if(/"(?:privateKey|secretKey|mnemonic|seedPhrase)"\s*:|-----BEGIN .*PRIVATE KEY-----/.test(content))sensitive.push(path.relative(root,p));}
check('artifact secret-field scan',sensitive.length===0,{files:allStage11.filter(p=>p.endsWith('.json')||p.endsWith('.jsonl')).length,matches:sensitive,scope:'Field/PEM pattern plus binding exact in-memory key scan; not universal leakage detection.'});
const report={at:new Date().toISOString(),passed:checks.filter(r=>r.pass).length,failed:checks.filter(r=>!r.pass).length,checks};console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
