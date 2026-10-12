import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {policyFor,extractSource} from '../../src/ybm-collector/source-policy.mjs';
import {examFields} from '../../src/ybm-collector/values.mjs';
import {registrationHtml,scoreHtml} from './source-fixture.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
process.env.LOG_LEVEL='silent';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const {providers,proto}=await import(require.resolve('@reclaimprotocol/attestor-core'));
const http=providers.http,version=proto.AttestorVersion.ATTESTOR_VERSION_3_2_0,ctx={version};
function receipt(role,html,index=0){
 const params=policyFor(role,index),request=http.createRequest({cookieStr:'SYNTHETIC_COOKIE_CANARY',paramValues:{encExamData:'SYNTHETIC_BODY_CANARY'}},structuredClone(params),quiet);
 const body=Buffer.from(html),response=Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nSet-Cookie: SYNTHETIC_RESPONSE_COOKIE\r\n\r\n`),body]);
 const redacted=Buffer.from(response);for(const r of http.getResponseRedactions({response,params,logger:quiet,ctx}))redacted.fill('*',r.fromIndex,r.toIndex);
 const req=Buffer.from(request.data);for(const r of request.redactions)req.fill('*',r.fromIndex,r.toIndex);
 const result=http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:req},{sender:'server',message:redacted}],params,logger:quiet,ctx});
 return {fields:result.extractedParameters,text:req.toString()+redacted.toString()};
}
for(const role of ['registration','score'])test('pinned official SDK agrees with DOM extraction and hides canaries: '+role,()=>{
 const html=role==='registration'?registrationHtml():scoreHtml(),result=receipt(role,html);
 assert.deepEqual(examFields(result.fields,role),extractSource(role,Buffer.from(html))[0].fields);
 for(const canary of ['SYNTHETIC_PRIVATE','SYNTHETIC_BIRTH','SYNTHETIC_LC','SYNTHETIC_RC','SYNTHETIC_COOKIE','SYNTHETIC_BODY','SYNTHETIC_RESPONSE_COOKIE'])assert.ok(!result.text.includes(canary));
});
test('fixed XPath index exposes only the selected exam and supports UTF-8 offsets',()=>{
 const result=receipt('score',scoreHtml([{number:'999999',score:'990'},{}]),1);
 assert.equal(result.fields.registration_number,'123456');assert.equal(result.fields.total_score,'850');assert.ok(!result.text.includes('999999'));assert.ok(!result.text.includes('990'));
});

test('all Korean weekdays survive UTF-8 redaction without revealing arbitrary weekday text',()=>{
 for(const day of ['월','화','수','목','금','토','일']){
  const html=scoreHtml().replace('(일)',`(${day})`);assert.equal(receipt('score',html).fields.total_score,'850');
 }
 assert.throws(()=>extractSource('score',Buffer.from(scoreHtml().replace('(일)','(PRIVATE)'))));
});

test('multi-column and styled registration rows hide attributes and comment lookalikes',()=>{
 const html=('<!--'+registrationHtml('2026.01.01','999999')+'-->'+registrationHtml())
  .replace('<html class="TOEIC"><body><p>SYNTHETIC_PRIVATE_NAME</p><table><tr><th>시험일</th><td><div>2026.09.20','<html lang="ko" data-secret="SYNTHETIC_ATTR_SECRET" class="TOEIC"><body><p>SYNTHETIC_PRIVATE_NAME</p><table><tr><th style="width:120px">시험일</th><td class="SYNTHETIC_ATTR_SECRET"><div>2026.09.20')
  .replaceAll('</td></tr><tr><th>수험번호','</td><th>수험번호');
 const result=receipt('registration',html);assert.deepEqual(examFields(result.fields,'registration'),extractSource('registration',Buffer.from(html))[0].fields);
 for(const secret of ['SYNTHETIC_ATTR_SECRET','999999','SYNTHETIC_PRIVATE','SYNTHETIC_BIRTH'])assert.ok(!result.text.includes(secret));
});
test('score text-node reveals exclude private attributes even when they resemble scores or identifiers',()=>{
 const html=scoreHtml().replace('class="trSB"','data-secret="999999" class="trSB active"').replaceAll('<td>','<td title="SYNTHETIC_PRIVATE" data-number="999999">');
 const result=receipt('score',html);assert.deepEqual(examFields(result.fields,'score'),extractSource('score',Buffer.from(html))[0].fields);assert.ok(!result.text.includes('SYNTHETIC_PRIVATE'));assert.ok(!result.text.includes('999999'));
});

test('SDK recipes cannot truncate another exam type or an oversized identifier into valid fields',()=>{
 assert.throws(()=>receipt('score',scoreHtml().replace('TOEIC</td>','TOEICSW</td>')));
 assert.throws(()=>receipt('score',scoreHtml([{number:'12345678901'}])));
 assert.throws(()=>receipt('registration',registrationHtml('2026.09.20','12345678901')));
 assert.throws(()=>receipt('score',scoreHtml().replace('TOEIC</td>','TOEIC<span>SW</span></td>')));
});

test('official SDK request creation cannot silently change the pre-login public policy',()=>{
 for(const role of ['registration','score']){
  const params=policyFor(role),before=structuredClone(params);
  http.createRequest({cookieStr:'SYNTHETIC_COOKIE',paramValues:{encExamData:'SYNTHETIC_BODY'}},params,quiet);
  assert.deepEqual(params,before);assert.equal(params.headers['User-Agent'],'reclaim/0.0.1');
 }
});
