import test from 'node:test';
import assert from 'node:assert/strict';
import {core,FIELDS,tableHtml} from './model.mjs';
import {policyFor} from '../../src/ybm-collector/source-policy.mjs';
import {historyParams} from '../../src/ybm-collector/history-policy.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
const http=core.providers.http,version=core.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0,ctx={version};
function receipt(params,html,splice=false) {
  const req=http.createRequest({cookieStr:'SYNTHETIC_COOKIE'},structuredClone(params),quiet);
  const body=Buffer.from(html),head=Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\n\r\n`);
  const response=Buffer.concat([head,body]),redacted=Buffer.from(response);
  if(splice){redacted.fill('*',head.length);let start=head.length;
    for(const token of ['TOEIC','2026.10.10(일)','123456','Total 950 (']){const at=response.indexOf(Buffer.from(token),start);assert(at>=start);response.copy(redacted,at,at,at+Buffer.byteLength(token));start=at+Buffer.byteLength(token);}}
  else for(const r of http.getResponseRedactions({response,params,logger:quiet,ctx}))redacted.fill('*',r.fromIndex,r.toIndex);
  const request=Buffer.from(req.data);for(const r of req.redactions)request.fill('*',r.fromIndex,r.toIndex);
  return http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:request},{sender:'server',message:redacted}],params,logger:quiet,ctx});
}
test('stock scalar policy still accepts a cross-row byte-splice COUNTEREXAMPLE',()=>{
  const html=tableHtml({...FIELDS,total_score:'700'},{...FIELDS,exam_date:'2026.09.20',registration_number:'654321',total_score:'950'});
  const result=receipt(policyFor('score',0),html,true);
  assert.deepEqual(result.extractedParameters,{...FIELDS,total_score:'950'});
});
test('existing whole-table source policy rejects the same splice before signing',()=>{
  const html=tableHtml({...FIELDS,total_score:'700'},{...FIELDS,exam_date:'2026.09.20',registration_number:'654321',total_score:'950'});
  assert.throws(()=>receipt(historyParams(),html,true));
  assert.deepEqual(receipt(historyParams(),html).extractedParameters,{history_html:html});
});
