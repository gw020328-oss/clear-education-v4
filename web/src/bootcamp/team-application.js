// Authenticated single-application display. No cohort fixtures or write authority.
import {el} from '../ui/dom.js';
import {displayState} from './criteria.js';
const line=(label,value)=>el('p',{},[el('strong',{text:label+' · '}),el('span',{text:value??'아직 확인되지 않음'})]);
const labels={'activity-complete':'강의 수강','assignment-submitted':'과제 제출','reflection-topics':'회고','python-basic-certificate':'HackerRank 인증서'};
export function teamApplicationSection({state:s,availability,button,agree,replay,refresh,readReceipt}){
 const box=el('section.team-application',{'aria-label':'현재 연결된 실제 신청'}),b=s.bootstrap,v=s.view,p=b?.expectedPayment;
 box.append(el('h2',{text:'현재 연결된 신청'}),line('역할',b?.role==='OPERATOR'?'운영자':b?.role==='PARTICIPANT'?'참가자':null),line('신청',b?.applicationId),el('p',{text:'서버가 연결한 신청 한 건입니다. 기수 전체 명단·집계는 조회하지 않았습니다.'}));
 if(p)box.append(line('수령 주소',p.recipient),line('지급 토큰',p.token),line('지급 금액',p.amountAtoms==='100000000'&&p.decimals===6&&p.symbol==='TEST'?'100 TEST':'지급 대상 확인 필요'));
 if(!v){box.append(el('p',{role:'status',text:s.error?'현재 판정을 읽지 못했습니다. 이전 판정으로 동의할 수 없습니다.':'원천 검증·수령 등록·재원 배정 후 현재 판정이 표시됩니다.'}));if(s.consentReplayPending)box.append(el('p',{text:availability.consent.reason}),button('앞선 지급 동의 결과 확인',replay,!!s.bootstrap?.failure));return box;}
 box.append(line('현재 판정',v.decision?.current&&v.decision?.evidenceCurrent?'현재':'재확인 필요'),line('판정 ID',v.target?.targetDecisionId),line('판정 버전',v.target?.targetDecisionRevision),line('판정 지문',v.target?.targetDecisionHash),line('정책 지문',v.policyHash),line('실행 매핑 지문',v.runtimeMappingHash));
 const rows=el('ul',{});for(const c of v.criteria??[]){const status=displayState(c);rows.append(el('li',{text:(labels[c.criterionId]??c.criterionId)+' · '+(status.state==='MET'?'현재 충족':'확인 필요')+(status.note?' · '+status.note:'')}));}box.append(rows,line('재원 배정',v.funding?.matchesCurrentDecision&&v.funding?.status==='FULLY_ALLOCATED'&&v.funding.amountAtoms==='100000000'&&v.funding.reservedAtoms==='100000000'?'현재 판정에 100 TEST 전액 배정됨':'현재 전액 배정 확인 필요'),line('동의 범위 지문',v.consent?.scopeHash));
 const agreed=role=>(v.consent?.records??[]).some(r=>r.actorRole===role&&r.value==='AGREE'&&r.scopeHash===v.consent.scopeHash&&r.decisionId===v.decision.id&&r.procedureId===v.procedure?.id);
 for(const role of v.consent?.requiredRoles??[])box.append(line(role==='COURSE_OPERATOR'?'운영자 동의':'참가자 동의',agreed(role)?'현재 판정에 기록됨':'대기'));
 box.append(el('p.team-review-remaining'),el('p',{text:'양측이 같은 최신 판정·수령 주소·100 TEST를 확인하고 각각 동의하면 지급 절차가 진행됩니다.'}),el('p',{text:availability.consent.reason}));
 if(s.consentReplayPending)box.append(button('앞선 지급 동의 결과 확인',replay,!!s.bootstrap?.failure));
 else if(agreed(v.role))box.append(el('p',{text:'이 역할의 현재 판정 동의가 기록됐습니다. 다른 역할 또는 지급 결과를 기다립니다.'}));
 else box.append(button('표시한 판정과 100 TEST 지급에 동의',agree,!availability.consent.enabled));
 box.append(button('현재 판정 다시 읽기',refresh,false,true),button('지급 영수증 읽기',readReceipt,false,true));
 if(s.receipt){box.append(el('h3',{text:'서버에서 조회한 지급 영수증'}),el('pre',{text:JSON.stringify(s.receipt,null,2)}));}
 return box;
}
