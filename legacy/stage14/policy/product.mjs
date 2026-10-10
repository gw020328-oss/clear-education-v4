// Browser-compatible product boundary. No keys, signing, provider or chain APIs.
export const fields=['program','participant','period','completion','evidence','issuer','amount','asset','deadline','exclusions'];
export const labels={program:'프로그램 이름',participant:'대상 참가자',period:'활동 기간 (UTC)',completion:'완료 조건',evidence:'필요한 증빙',issuer:'증빙 발급자',amount:'환급 금액',asset:'환급 자산',deadline:'청구 마감 (UTC)',exclusions:'제외 조건'};
export const expected={program:'캠퍼스 4주 챌린지',participant:'등록한 대학생 참가자',period:'2030-01-01T00:00:00Z / 2030-01-29T00:00:00Z',completion:'주차별 활동 4회 모두 완료',evidence:'주차별 완료 서명 4개',issuer:'프로그램 지정 발급자',amount:'50',asset:'TEST',deadline:'2030-02-05T00:00:00Z',exclusions:'없음'};
export const statement=fields.map(k=>`${labels[k]}: ${expected[k]}`).join('\n')+'\n사업자는 등록 시 참가자 몫을 사전 예치합니다. 참가비 결제 후 4주 프로그램을 모두 완료하면 등록한 고정 지갑으로 한 번 환급합니다. 추가 지급 승인 없이 지정 발급자 서명으로 청구하며, 승인 조건 변경과 청구 마감 전 취소는 불가합니다.';
export function packet(text){if(typeof text!=='string'||text.length>10000||!text.trim())throw Error('SOURCE_SIZE');let offset=0;const spans=text.split('\n').map((line,i)=>{const s={id:'S'+String(i+1).padStart(2,'0'),start:offset,end:offset+line.length,text:line};offset+=line.length+1;return s;}).filter(s=>s.text.length);return {text,spans};}
const valueSchema={type:'object',properties:{value:{anyOf:[{type:'string'},{type:'null'}]},sourceSpanIds:{type:'array',items:{type:'string'}},status:{type:'string',enum:['DIRECT','UNSUPPORTED']}},required:['value','sourceSpanIds','status'],additionalProperties:false};
export const proposalSchema={type:'object',properties:{type:{type:'string',enum:['PolicyProposalV1']},state:{type:'string',enum:['DRAFT']},fields:{type:'object',properties:Object.fromEntries(fields.map(f=>[f,valueSchema])),required:fields,additionalProperties:false},ambiguities:{type:'array',items:{type:'object',properties:{field:{type:'string',enum:fields},question:{type:'string'}},required:['field','question'],additionalProperties:false}},unsupported:{type:'array',items:{type:'string',enum:fields}}},required:['type','state','fields','ambiguities','unsupported'],additionalProperties:false};
function exact(x,keys){return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===[...keys].sort().join('|');}
export function validateDraft(d,source){const errors=[];if(!exact(d,['type','state','fields','ambiguities','unsupported'])||d.type!=='PolicyProposalV1'||d.state!=='DRAFT'||!exact(d.fields,fields))return ['DRAFT_SCHEMA'];
 for(const f of fields){const v=d.fields[f];if(!exact(v,['value','sourceSpanIds','status'])||!['DIRECT','UNSUPPORTED'].includes(v.status)||!(v.value===null||typeof v.value==='string'&&v.value.length<=500)||!Array.isArray(v.sourceSpanIds)||v.sourceSpanIds.some(id=>typeof id!=='string')){errors.push(f+':SCHEMA');continue;}
  if(v.status==='UNSUPPORTED'&&(v.value!==null||v.sourceSpanIds.length))errors.push(f+':UNSUPPORTED_VALUE');
  if(v.status==='DIRECT'&&(!v.value||!v.sourceSpanIds.length||new Set(v.sourceSpanIds).size!==v.sourceSpanIds.length||v.sourceSpanIds.some(id=>!source.spans.some(s=>s.id===id&&source.text.slice(s.start,s.end)===s.text))||!v.sourceSpanIds.some(id=>source.spans.find(s=>s.id===id)?.text.includes(v.value))))errors.push(f+':INVALID_SPAN');
 }
 if(!Array.isArray(d.ambiguities)||d.ambiguities.length>20||d.ambiguities.some(a=>!exact(a,['field','question'])||!fields.includes(a.field)||typeof a.question!=='string'||!a.question.trim()||a.question.length>500))errors.push('AMBIGUITY_SCHEMA');
 if(!Array.isArray(d.unsupported)||d.unsupported.some(f=>!fields.includes(f))||fields.some(f=>d.fields[f]?.status==='UNSUPPORTED'&&!d.unsupported.includes(f)))errors.push('UNSUPPORTED_SCHEMA');
 return errors;
}
export const emptyDraft=()=>({type:'PolicyProposalV1',state:'DRAFT',fields:Object.fromEntries(fields.map(f=>[f,{value:null,status:'UNSUPPORTED',sourceSpanIds:[]}])),ambiguities:[],unsupported:[...fields]});
export function cachedDraft(source=packet(statement)){const d=emptyDraft();for(const f of fields){const span=source.spans.find(s=>s.text===`${labels[f]}: ${expected[f]}`);if(span){d.fields[f]={value:expected[f],status:'DIRECT',sourceSpanIds:[span.id]};d.unsupported=d.unsupported.filter(x=>x!==f);}else d.ambiguities.push({field:f,question:labels[f]+'을 확인해 주세요.'});}return d;}
export function reviewErrors(review,source){const errors=[];if(!review||review.type!=='HumanReviewInput'||!exact(review.values,fields)||!exact(review.origins,fields)||!exact(review.citations,fields))return ['REVIEW_SCHEMA'];
 if(review.confirmed!==true)errors.push('HUMAN_CONFIRMATION_REQUIRED');
 if(!Array.isArray(review.questions)||review.questions.some(q=>!q.answer?.trim()))errors.push('UNRESOLVED_AMBIGUITY');
 for(const f of fields){const v=review.values[f],origin=review.origins[f];if(typeof v!=='string'||!v.trim()||v.length>500)errors.push(f+':REQUIRED');if(!['DIRECT','USER_INPUT'].includes(origin))errors.push(f+':REVIEW_REQUIRED');
  if(origin==='DIRECT'){const ids=review.citations[f];if(!Array.isArray(ids)||!ids.length||ids.some(id=>!source.spans.some(s=>s.id===id&&source.text.slice(s.start,s.end)===s.text))||!ids.some(id=>source.spans.find(s=>s.id===id)?.text.includes(v)))errors.push(f+':INVALID_SPAN');}
 }
 for(const f of fields.filter(f=>f!=='program'))if(review.values[f]!==expected[f])errors.push(f+(f==='issuer'?':ISSUER_NOT_ALLOWED':':RUNTIME_NOT_SUPPORTED'));
 return [...new Set(errors)];
}
export function reviewFromDraft(d){return {type:'HumanReviewInput',values:Object.fromEntries(fields.map(f=>[f,d.fields[f].value??''])),origins:Object.fromEntries(fields.map(f=>[f,d.fields[f].status==='DIRECT'?'DIRECT':'UNSUPPORTED'])),citations:Object.fromEntries(fields.map(f=>[f,[...d.fields[f].sourceSpanIds]])),questions:d.ambiguities.map(a=>({...a,answer:''})),confirmed:false};}
export const cases=[{id:'complete',source:packet(statement)},{id:'missing',source:packet(statement.split('\n').filter(s=>!s.startsWith(labels.deadline+':')&&!s.startsWith(labels.issuer+':')).join('\n'))},{id:'conflict',source:packet(statement+'\n다른 안내에는 환급 금액이 30 TEST라고 적혀 있습니다. 두 안내 중 어느 것이 최종 조건인지는 미정입니다.')}];
