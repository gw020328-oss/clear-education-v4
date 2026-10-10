import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateSchema} from '../../../stage9/tools/validate-schema.mjs';
import {inputPacket} from '../../../stage9/tools/input-packet.mjs';
import {runtimeGate} from './runtime-gate.mjs';
import {score} from './score.mjs';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const read=p=>fs.readFileSync(path.join(root,p),'utf8');
export const lines=p=>read(p).trim().split('\n').map(JSON.parse);
export function verify(pre=false){
 const checks=[],check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
 const rows=lines('DATASET.jsonl'),refs=lines('REFERENCE_LABELS.jsonl'),schema=JSON.parse(read('schemas/output.schema.json'));
 const old=fs.readFileSync(path.join(root,'../../stage9/DATASET.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 check('12 original inputs and splits',rows.length===12&&rows.every((r,i)=>r.split===old[i].split&&r.operatorId===old[i].operatorId&&JSON.stringify(r.input)===JSON.stringify(inputPacket(old[i]))));
 check('operator split independence',new Set(rows.map(r=>r.operatorId)).size===12);
 check('label distribution 4/2/6',JSON.stringify(['POLICY_SUPPORTED','POLICY_UNSUPPORTED','CLARIFICATION_REQUIRED'].map(l=>refs.filter(r=>r.expected.policyLabel===l).length))==='[4,2,6]');
 for(const r of refs){
  const row=rows.find(x=>x.sourceId===r.sourceId),ids=new Set(row.input.spans.map(x=>x.spanId));
  check(r.sourceId+' reference schema',validateSchema(r.expected,schema).length===0);
  check(r.sourceId+' reference source links',Object.values(r.fieldRules).every(f=>f.spanIds.every(s=>ids.has(s))&&f.reason.length>0));
  check(r.sourceId+' frozen scoring self-check',score(r.expected,r,schema).fieldCorrect===9);
 }
 for(const f of lines('SYNTHETIC_RUNTIME_FIXTURES.jsonl')){
  const actual=runtimeGate(f.input);check(f.fixtureId+' '+f.name,actual.runtimeExecutable===f.expectedRuntimeExecutable,{expected:f.expectedRuntimeExecutable,actual});
 }
 const previous=JSON.parse(fs.readFileSync(path.join(root,'../artifacts/prior-file-hashes.json'),'utf8'));
 const changed=Object.entries(previous).filter(([p,h])=>sha(fs.readFileSync(path.join(root,'../..',p)))!==h).map(([p])=>p);
 check('previous files preserved',changed.length===0,{files:Object.keys(previous).length,changed});
 if(!pre){
  const m=JSON.parse(read('SHA256_MANIFEST.json')),receipt=JSON.parse(read('FREEZE_RECEIPT.json'));
  for(const [p,h]of Object.entries(m.files))check('frozen '+p,sha(read(p))===h);
  check('freeze receipt',sha(read('SHA256_MANIFEST.json'))===receipt.manifestSha256);
 }
 return {checkedAt:new Date().toISOString(),preFreeze:pre,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=verify(process.argv.includes('--pre-freeze'));console.log(JSON.stringify(r,null,2));if(r.failed)process.exitCode=1;}
