// Synthetic HTTP receipts only: no login, TLS, witness, or private source data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const require=createRequire(new URL('src/ybm-collector/package.json',root));
process.env.LOG_LEVEL='silent';
const sdk=await import(require.resolve('@reclaimprotocol/attestor-core'));
const {policyFor}=await import(new URL('src/ybm-collector/source-policy.mjs',root));
const {scoreHtml}=await import(new URL('tests/ybm-collector/source-fixture.mjs',root));
const {quiet}=await import(new URL('src/ybm-collector/client.mjs',root));
const http=sdk.providers.http,version=sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0,ctx={version};
export function predicatePolicy(){
 const p=policyFor('score',0);
 p.responseMatches[0].value=p.responseMatches[0].value
  .replace('(?<exam_date>\\d{4}\\.\\d{2}\\.\\d{2})','(?:2026\\.09\\.(?:0[1-9]|[12][0-9]|30))')
  .replace('(?<registration_number>\\d{6,10})','(?:\\d{6,10})')
  .replace('(?<total_score>\\d{2,3})','(?:8[0-9][05]|9[0-8][05]|990)');
 return p;
}
function receipt(rows,malicious=false){
 const params=predicatePolicy(),req=http.createRequest({cookieStr:'SYNTHETIC_COOKIE'},structuredClone(params),quiet);
 const body=Buffer.from(scoreHtml(rows));
 const headers=Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\n\r\n`);
 const response=Buffer.concat([headers,body]),redacted=Buffer.from(response);
 if(malicious){
  // Reveal the first row's type/date/number, then the second row's score.
  // No source byte is altered; only authentic bytes are selectively hidden.
  redacted.fill('*',headers.length);
  let start=headers.length;
  for(const token of ['TOEIC','2026.09.20(일)','123456','Total 850 (']){
   const at=response.indexOf(Buffer.from(token),start);assert(at>=start);response.copy(redacted,at,at,at+Buffer.byteLength(token));start=at+Buffer.byteLength(token);
  }
 }else for(const r of http.getResponseRedactions({response,params,logger:quiet,ctx}))redacted.fill('*',r.fromIndex,r.toIndex);
 const request=Buffer.from(req.data);for(const r of req.redactions)request.fill('*',r.fromIndex,r.toIndex);
 return http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:request},{sender:'server',message:redacted}],params,logger:quiet,ctx});
}
const tests=[];function check(name,fn){try{fn();tests.push({name,status:'PASS'});}catch{tests.push({name,status:'FAIL'});}}
check('197 valid TOEIC totals: accept exactly 800..990, omit score/date/number captures',()=>{
 for(let score=10;score<=990;score+=5){if(score<800)assert.throws(()=>receipt([{score:String(score)}]));else assert.deepEqual(receipt([{score:String(score)}]).extractedParameters,{exam_type:'TOEIC'});}
});
check('period includes September 1 and 30; rejects invalid and out-of-period dates',()=>{
 for(const date of ['2026.09.01','2026.09.30'])receipt([{date}]);
 for(const date of ['2026.08.31','2026.10.01','2026.09.00','2026.09.31'])assert.throws(()=>receipt([{date}]));
});
check('honest first row below threshold rejected even with eligible second row',()=>assert.throws(()=>receipt([{score:'795'},{date:'2026.08.20',number:'654321',score:'850'}])));
let spliceAccepted=false;
check('counterexample: authentic bytes spliced across ineligible rows pass receipt predicate',()=>{
 const r=receipt([{score:'795'},{date:'2026.08.20',number:'654321',score:'850'}],true);
 assert.deepEqual(r.extractedParameters,{exam_type:'TOEIC'});spliceAccepted=true;
});
check('stwo OPRF default maker unavailable',()=>assert.throws(()=>sdk.makeDefaultOPRFOperator('chacha20','stwo',quiet),/No OPRF operator maker/));
const truncation=[6,8,10,16,32].map(length=>({inputBytes:length,outputCharacters:sdk.binaryHashToStr(new Uint8Array(32).fill(42),length).length,maxOutputBits:Math.min(256,length*6),birthdayCollisionProbabilityAt100k:-Math.expm1(-(100000*99999)/(2*2**Math.min(256,length*6)))}));
check('short hashed reveal output is truncated to input length',()=>assert.equal(truncation[0].outputCharacters,6));
let gnark={status:'NOT_RUN'};
try{const op=sdk.makeDefaultOPRFOperator('chacha20','gnark',quiet);await op.generateOPRFRequestData(new TextEncoder().encode('SYNTHETIC-EXAM-000001'),'clear-spike',quiet);gnark={status:'PASS_REQUEST_ONLY'};}
catch(error){gnark={status:'BLOCKED',reason:/Gnark library not built/.test(error.message)?'NATIVE_LIBRARY_NOT_PACKAGED':/cannot open|not found|No such|dlopen/.test(error.message)?'NATIVE_LIBRARY_LOAD_FAILED':'OPRF_RUNTIME_FAILED'};}
const report={mode:'SYNTHETIC_SDK_RECEIPT_ONLY',sdkVersion:'5.1.4',zkVersion:'5.1.6',tests,checksPassed:tests.filter(t=>t.status==='PASS').length,checksFailed:tests.filter(t=>t.status==='FAIL').length,
 qualificationStatus:spliceAccepted?'NO_GO_ROW_INTEGRITY_COUNTEREXAMPLE':'UNRESOLVED',spliceAccepted,
 privacy:{signedExtractedFields:['exam_type'],scoreDateNumberCaptureOmitted:true,rawValuesStillVisibleToAttestor:true,sourceAuthenticityProved:false},
 oprf:{stwo:'UNSUPPORTED_DEFAULT_MAKER',gnark,truncation,domainSeparator:sdk.TOPRF_DOMAIN_SEPARATOR,stableAcrossOfficialServersAndKeyRotation:'NOT_RUN'},
 limits:['No real TLS or witness signature','Counterexample is receipt validation only, not a forged official proof','No attendance or inventory completeness','No proof that hidden exam identifier is stable or source-bound','No production policy changed'],checkedAt:new Date().toISOString()};
fs.writeFileSync(new URL('predicate-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.checksFailed)process.exitCode=1;
