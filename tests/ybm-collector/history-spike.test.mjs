import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {historyParams,inspectHistory} from '../../src/ybm-collector/history-policy.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
import {scoreHtml,scoreRow} from './source-fixture.mjs';
import {parseOptions} from '../../src/mac-collector/options.mjs';
process.env.LOG_LEVEL='silent';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const {providers,proto}=await import(require.resolve('@reclaimprotocol/attestor-core'));
const http=providers.http,v=proto.AttestorVersion.ATTESTOR_VERSION_3_2_0;
function prove(html,{version=v,maskRow=false}={}){
 const params=historyParams(),request=http.createRequest({cookieStr:'SYNTHETIC_COOKIE'},params,quiet);
 const body=Buffer.from(html),response=Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nSet-Cookie: SYNTHETIC_RESPONSE_COOKIE\r\n\r\n`),body]);
 const redacted=Buffer.from(response);for(const r of http.getResponseRedactions({response,params,logger:quiet,ctx:{version}}))redacted.fill('*',r.fromIndex,r.toIndex);
 if(maskRow){const row=Buffer.from(scoreRow({score:'990',number:'999999'}));const start=redacted.indexOf(row);assert.ok(start>0);redacted.fill('*',start,start+row.length);}
 const req=Buffer.from(request.data);for(const r of request.redactions)req.fill('*',r.fromIndex,r.toIndex);
 const result=http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:req},{sender:'server',message:redacted}],params,logger:quiet,ctx:{version}});
 assert.ok(!redacted.includes('SYNTHETIC_RESPONSE_COOKIE'));assert.ok(!req.includes('SYNTHETIC_COOKIE'));
 return result.extractedParameters.history_html;
}
test('official provider reveals entire UTF-8 history, hides request and response cookies',()=>{const html=scoreHtml([{score:'990',number:'999999'},{}]);assert.equal(prove(html),html.match(/<table[\s\S]*?<\/table>/)[0]);assert.equal(inspectHistory(prove(html)).parsedRowCount,2);});
test('redacting the high score is detected; no claim of full history',()=>{assert.throws(()=>prove(scoreHtml([{score:'990',number:'999999'},{}]),{maskRow:true}));});
test('older protocol that strips redaction runs cannot match anchored response policy',()=>{assert.throws(()=>prove(scoreHtml([{score:'990',number:'999999'},{}]),{version:proto.AttestorVersion.ATTESTOR_VERSION_3_1_0,maskRow:true}));});
test('history does not silently truncate at legacy sixteen-row limit',()=>{const html=scoreHtml(Array.from({length:20},(_,i)=>({number:String(123456+i)})));assert.equal(inspectHistory(html).parsedRowCount,20);});
test('pagination remains a coverage gate even with valid full-page proof',()=>{const s=inspectHistory(scoreHtml().replace('</body>','<div class="pagination">다음 페이지</div></body>'));assert.equal(s.paginationIndicator,true);assert.equal(s.fullHistoryProven,false);});
test('login page or empty response does not prove non-attendance',()=>{assert.equal(inspectHistory('<html><body>로그인</body></html>').layoutSupported,false);assert.throws(()=>inspectHistory(''));});
test('separate explicit mode cannot mix with synthetic or other live modes',()=>{assert.equal(parseOptions(['--ybm-history-check']).historyCheck,true);assert.throws(()=>parseOptions(['--ybm-history-check'],'/tmp/test'));assert.throws(()=>parseOptions(['--ybm-history-check','--ybm-proof-check']));});
test('trailing comments and footer scripts are diagnosed without discarding the session',()=>{const html=scoreHtml()+'<!-- footer --><script>void 0;</script>';const s=inspectHistory(html);assert.equal(s.parsedRowCount,1);assert.equal(s.trailingMarkup,true);assert.equal(inspectHistory(prove(html)).parsedRowCount,1);assert.equal(s.fullHistoryProven,false);});
