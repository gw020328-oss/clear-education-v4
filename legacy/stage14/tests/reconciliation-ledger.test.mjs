// Negative tests modify memory fixtures only; never mutate original evidence.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,sha} from '../lib/io.mjs';
import {reconstructLedger,need} from './reconciliation-ledger.mjs';
export function ledgerNegativeTests(){
 const originalNames=fs.readdirSync(resolve(root,'artifacts/ai'));
 const definitions=[
  ['seventh-formal-attempt','ATTEMPT_FILE_SET',f=>f.names.push('attempt-7.reserved.json')],
  ['missing-raw-file','ATTEMPT_FILE_SET',f=>{f.names=f.names.filter(p=>p!=='attempt-6.response.txt');}],
  ['duplicate-number-alias','ATTEMPT_FILE_SET',f=>f.names.push('attempt-06.json')],
  ['result-number-mismatch','ATTEMPT_IDENTITY',f=>f.edit('artifacts/ai/attempt-6.json',x=>{x.number=5;})],
  ['six-misclassified-as-retry','ATTEMPT_IDENTITY',f=>f.edit('artifacts/ai/attempt-6.json',x=>{x.attempt=2;})],
  ['reservation-cost-drift','RESERVATION_COST_MISMATCH',f=>f.edit('artifacts/ai/attempt-6.reserved.json',x=>{x.estimatedCostUSD+=.001;})],
  ['cumulative-before-drift','RESERVATION_COST_MISMATCH',f=>f.edit('artifacts/ai/attempt-6.reserved.json',x=>{x.estimatedCostBeforeUSD=0;})],
  ['usage-cost-drift','USAGE_COST_MISMATCH',f=>f.edit('artifacts/ai/attempt-6.json',x=>{x.usageEstimatedCostUSD+=.001;})],
  ['raw-hash-drift','RAW_REQUEST_RESPONSE_HASH',f=>f.edit('artifacts/ai/attempt-6.json',x=>{x.rawResponseSha256='0'.repeat(64);})],
  ['retry-body-different-same-length','RETRY_POLICY',f=>{
   const p='artifacts/ai/attempt-5.request.json',body=JSON.parse(f.bytes(p));
   need(body.input.includes('50'),'RETRY_FIXTURE');body.input=body.input.replace('50','51');const modified=Buffer.from(JSON.stringify(body));need(modified.length===f.bytes(p).length,'RETRY_FIXTURE_LENGTH');f.overrides.set(p,modified);f.edit('artifacts/ai/attempt-5.reserved.json',x=>{x.requestSha256=sha(modified);});
  }]
 ];
 const results=definitions.map(([id,expected,mutate])=>{
  const f={names:[...originalNames],overrides:new Map(),bytes(p){return this.overrides.get(p)??fs.readFileSync(resolve(root,p));},edit(p,change){const item=JSON.parse(this.bytes(p));change(item);this.overrides.set(p,Buffer.from(JSON.stringify(item)));}};
  mutate(f);let actual=null;try{reconstructLedger('MEMORY_NEGATIVE_TEST',{names:()=>f.names,bytes:p=>f.bytes(p)});}catch(e){actual=e.message;}
  return {id,expectedError:expected,actualError:actual,passed:actual===expected};
 });
 need(results.every(r=>r.passed),'LEDGER_NEGATIVE_TEST_FAILED');
 return {at:new Date().toISOString(),kind:'MEMORY_ONLY_LEDGER_NEGATIVE_TESTS',passed:results.length,failed:0,externalAPICalls:0,newTransactions:0,originalFileWrites:0,sourceHashes:Object.fromEntries(['tests/reconciliation-ledger.mjs','tests/reconciliation-ledger.test.mjs'].map(p=>[p,sha(fs.readFileSync(resolve(root,p)))])),results};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(ledgerNegativeTests(),null,2));}catch{console.log(JSON.stringify({status:'FAIL',error:'LEDGER_NEGATIVE_TEST_FAILED'}));process.exitCode=1;}}
