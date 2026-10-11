// Synthetic HTML grammar only. Never a current-YBM policy or TLS verifier.
import { providers, proto } from '@reclaimprotocol/attestor-core';
const http = providers.http;
export const version = proto.AttestorVersion.ATTESTOR_VERSION_3_2_0;
export const quiet = Object.freeze(Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(k => [k, () => {}])));
const ctx = { version };
const guard = (v, code) => { if (!v) throw new Error(code); };
const row = (id, named = false, score = true) => {
  const capture = (name, value) => named ? `(?<${name}>${value})` : `(?:${value})`;
  return `<tr><td>${capture('exam_type','TOEIC')}</td><td>${capture('exam_date','[0-9]{4}-[0-9]{2}-[0-9]{2}')}</td><td>${capture('registration_number',id)}</td>${score ? `<td>${capture('total_score','[0-9]{2,3}')}</td>` : ''}</tr>`;
};
export function syntheticPolicy(role, selectedId) {
  guard(['registration','score'].includes(role) && /^[0-9]{6}$/.test(selectedId), 'SYNTHETIC_POLICY_INPUT');
  const hasScore = role === 'score', selected = row(selectedId, true, hasScore), plain = row(selectedId, false, hasScore);
  return {
    url: `https://example.invalid/${role}`, method: role === 'registration' ? 'POST' : 'GET',
    headers: { 'User-Agent':'CLEAR-SYNTHETIC-W02B', 'Content-Type':'application/x-www-form-urlencoded' },
    ...(role === 'registration' ? { body:'encExamData={{encExamData}}&zzxxcc=' } : {}),
    responseMatches: [
      { type:'regex',value:`<table id="exams">(?:${row('[0-9]{6}',false,hasScore)})+</table>` },
      { type:'regex',value:selected },
      { type:'regex',value:`${plain}[\\s\\S]*${plain}`,invert:true },
      { type:'regex',value:'<table id="exams">[\\s\\S]*<table id="exams">',invert:true },
    ],
    // Binary regex offsets are deliberately separate from UTF-8 text matching.
    responseRedactions:[{regex:'<table id="exams">[^*]*?</table>'}],
    writeRedactionMode:'zk',
  };
}
export function syntheticHtml(rows, role = 'score') {
  return '<html><p>합성 이름 SYNTHETIC_PRIVATE_NAME 한글 😀</p><table id="exams">' + rows.map(r =>
    `<tr><td>${r.type ?? 'TOEIC'}</td><td>${r.date ?? '2026-09-20'}</td><td>${r.id}</td>${role === 'score' ? `<td>${r.score}</td>` : ''}</tr>`).join('') + '</table></html>';
}
export function syntheticExchange(params, html, status = '200 OK') {
  const request = http.createRequest({ cookieStr:'SYNTHETIC_COOKIE_CANARY',paramValues:{encExamData:'SYNTHETIC_BODY_CANARY'} },structuredClone(params),quiet);
  const body = Buffer.from(html);
  const response = Buffer.concat([Buffer.from(`HTTP/1.1 ${status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nSet-Cookie: SYNTHETIC_SET_COOKIE_CANARY\r\n\r\n`),body]);
  return { request,response };
}
function redact(bytes, slices) {
  const masked = Buffer.from(bytes);
  for(const {fromIndex,toIndex} of slices) masked.fill('*',fromIndex,toIndex);
  return masked;
}
export function verifySyntheticReceipt(params, exchange, useRedactions = true) {
  const response = useRedactions ? redact(exchange.response,http.getResponseRedactions({response:exchange.response,params,logger:quiet,ctx})) : exchange.response;
  const request = redact(exchange.request.data,exchange.request.redactions);
  const result = http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:request},{sender:'server',message:response}],params,logger:quiet,ctx});
  return { fields:result.extractedParameters,request,response };
}
export function validateSyntheticFields(fields, role) {
  const names = ['exam_type','exam_date','registration_number',...(role === 'score' ? ['total_score'] : [])];
  guard(fields && Object.keys(fields).length === names.length && names.every(k => typeof fields[k] === 'string'), 'FIELDS');
  guard(fields.exam_type === 'TOEIC' && /^[0-9]{6}$/.test(fields.registration_number), 'EXAM');
  const t = Date.parse(`${fields.exam_date}T00:00:00Z`);
  guard(Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === fields.exam_date, 'DATE');
  if(role === 'score') guard(/^[0-9]{2,3}$/.test(fields.total_score) && Number(fields.total_score) >= 10 && Number(fields.total_score) <= 990 && Number(fields.total_score)%5 === 0, 'SCORE');
  return Object.freeze({...fields});
}
