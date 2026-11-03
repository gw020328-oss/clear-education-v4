import {el} from '../ui/dom.js';
import {CRITERIA} from './criteria.js';
const names={completionState:'완료 상태',completionMode:'완료 방식',sourceCompletedAt:'완료 기록 시각',submissionState:'제출 상태',sourceSubmittedAt:'제출 기록 시각',certificateName:'인증서',issuerStatus:'발급 상태',achievementAt:'취득 시각'};
export function evidenceDetail({view,criterionId,evidence,error=false}){
 const box=el('section.bcx-detail',{},[el('h3',{text:CRITERIA[criterionId]?.label??criterionId})]);
 const matches=view&&evidence?.role===view.role&&evidence?.applicationId===view.applicationId&&evidence.manifest?.decision?.decisionId===view.decision.id&&evidence.manifest.decision.decisionHash===view.decision.hash;
 if(!matches){box.append(el('p',{role:'status',text:error?'근거를 읽지 못했습니다. 조건을 다시 선택해 조회하세요.':'현재 판정의 근거를 조회합니다.'}));return box;}
 const row=evidence.manifest.criteria.find(r=>r.criterionId===criterionId),availability=evidence.availability?.find(r=>r.criterionId===criterionId);
 if(!row){box.append(el('p',{text:'이 조건의 확인 내역이 제공되지 않았습니다.'}));return box;}
 box.append(el('p',{text:'서버 판정 · '+row.state}),el('p',{text:'부족 사유 · '+(view.criteria.find(r=>r.criterionId===criterionId)?.reasonCode??'별도 사유 미제공')}));
 const list=el('dl.bcx-pairs',{});for(const [k,label]of Object.entries(names)){const v=row.checks?.[k];if(v!==undefined&&v!==null)list.append(el('dt',{text:label}),el('dd',{text:String(v)}));}box.append(list);
 for(const topic of row.checks?.topics??[])box.append(el('p',{text:topic.topicId+' · '+topic.state+(topic.location?' · 원문 위치 '+topic.location.start+'–'+topic.location.end+' (UTF-16)':' · 문장 위치 미제공')}));
 const expired=['EXPIRED','DELETED'].includes(availability?.original?.status);
 box.append(el('p',{text:expired?'원문 보관 기한이 지났거나 삭제됐습니다. 판정 기록은 남아 있습니다.':'원문 조회 API가 제공되지 않아 원문과 문장 강조를 표시할 수 없습니다.'}),el('details',{},[el('summary',{text:'근거 지문과 확인 내역'}),el('pre',{text:JSON.stringify({manifestHash:evidence.manifestHash,source:row.source,verification:row.verification,checks:row.checks},null,2)})]));return box;
}
