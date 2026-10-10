import fs from 'node:fs';
import path from 'node:path';
import {verify,sha,lines,read} from '../protocol-v2/tools/verify.mjs';
const dir=process.argv[2];if(!dir)throw Error('run directory required');
const readRun=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const files=fs.readdirSync(dir),calls=files.filter(x=>/^v2-.*[.]json$/.test(x)).sort().map(readRun),smokes=files.filter(x=>/^smoke-[0-9]+[.]json$/.test(x)).sort().map(readRun);
const selected=readRun('model-selection.json'),receipt=JSON.parse(read('FREEZE_RECEIPT.json')),schema=JSON.parse(read('schemas/output.schema.json')),dataset=lines('DATASET.jsonl');
const checks=[],check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const frozen=verify();check('frozen and prior preserved',frozen.failed===0,{passed:frozen.passed,failed:frozen.failed});
const expected=[];for(const r of dataset)for(let n=1;n<=(r.split==='dev'?1:2);n++)for(const arm of ['B','C'])expected.push(`v2-${r.sourceId}-${arm}-r${n}`);
check('all 40 planned calls present exactly once',calls.length===40&&JSON.stringify(calls.map(x=>x.id).sort())===JSON.stringify(expected.sort()));
check('freeze before any inference attempt',smokes.every(s=>Date.parse(s.smoke.startedAt)>Date.parse(receipt.frozenAt))&&calls.every(c=>Date.parse(c.call.startedAt)>Date.parse(receipt.frozenAt)));
check('selected before public inference',calls.every(c=>Date.parse(c.call.startedAt)>=Date.parse(selected.selectedAt)));
check('preferred order without quality selection',smokes.every((s,i)=>s.name===['llama3.3:70b','llama3.2:latest','gemma3:4b'][i])&&smokes.at(-1)?.usable===true&&smokes.slice(0,-1).every(s=>!s.usable));
for(const c of calls){
 const row=dataset.find(x=>x.sourceId===c.sourceId),req=c.call.request.payload,user=JSON.parse(req.messages[1].content);
 check(c.id+' identical frozen inputs',JSON.stringify(user.input)===JSON.stringify({...row.input,runtime:null})&&JSON.stringify(user.outputSchema)===JSON.stringify(schema)&&c.inputSha256===sha(JSON.stringify(user.input)));
 check(c.id+' same model and parameters',req.model===selected.name&&c.model.digest===selected.digest&&req.options.num_ctx===16384&&req.options.num_predict===2048&&req.options.temperature===0.2&&req.options.top_p===0.95&&req.options.seed===(c.repeat===1?137:271)&&req.format==='json');
 check(c.id+' frozen prompt only',req.messages.length===2&&req.messages[0].content===read('prompts/'+c.arm+'.txt')&&Object.keys(user).join('|')==='input|outputSchema');
 check(c.id+' result record and no retry',c.call.retries===0&&Object.hasOwn(c,'parsed')&&Object.hasOwn(c,'delivered')&&!!c.expected&&!!c.deliveredScore&&c.gateApplied===(c.arm==='C'));
}
const runtime=readRun('runtime-results.json');check('runtime cases 19 with 2 positive',runtime.length===19&&runtime.filter(x=>x.expected).length===2&&runtime.every(x=>x.result.runtimeExecutable===x.expected));
const secretPaths=[];
function scan(v,p){if(typeof v==='string'&&/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v))secretPaths.push(p);if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(/^(privateKey|mnemonic|seedPhrase|secretKey)$/i.test(k))secretPaths.push(p+'.'+k);scan(x,p+'.'+k);}}
for(const file of files.filter(f=>f.endsWith('.json')))scan(readRun(file),file);
for(const f of lines('SYNTHETIC_RUNTIME_FIXTURES.jsonl'))scan(f,f.fixtureId);
check('no private-key fields or PEM blocks in JSON evidence',secretPaths.length===0,secretPaths);
console.log(JSON.stringify({auditedAt:new Date().toISOString(),runDir:dir,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,publicCalls:calls.length,smokeInferenceAttempts:smokes.length,model:selected.name,checks,limits:['Secret-pattern scan is not universal data-loss detection.','Synthetic observation fields are not live chain data.','Automated scoring is a frozen provisional rubric, not expert semantic review.']},null,2));
if(checks.some(x=>!x.pass))process.exitCode=1;
