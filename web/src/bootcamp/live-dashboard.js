// Existing design layout, bound to one authenticated application; actions remain owner callbacks.
import {el} from '../ui/dom.js';
import {navBar,ghostWord,statusPill} from '../ui/brand.js';
import {progressSection} from './student-view.js';
export function liveDashboard({view,workflow,operator=false}){
 const band=(title,node)=>el('section.band.band--card',{},[el('div.band-inner',{},[el('h2',{text:title}),node])]);
 const section=el('section.bcx',{},[navBar({who:operator?'운영자':'참가자'}),el('section.hero.grid-bg',{},[el('div',{},[ghostWord('CLEAR'),statusPill(workflow.paid?'수령 확인':'신청 진행'),
  el('p.hero-kicker',{text:operator?'운영자 · 연결된 신청 1건':'참가자 · 내 신청'}),
  el('h1.hero-title',{text:workflow.paid?'100 TEST 수령 확인':operator?'신청 검토와 지급':'내 진행 현황'}),
  el('p.hero-sub',{text:workflow.paid?'지급 영수증에서 수령 주소와 정확한 100 TEST 수령을 확인했습니다.':workflow.summary}),
 ])]),band('지금 할 일',workflow.preparation)]);
 if(view)section.append(band('조건별 진행 현황',progressSection(view,{onOpen:workflow.openCondition})));
 else section.append(band('조건별 진행 현황',el('p',{text:'증빙 확인 후 서버의 네 조건 판정을 표시합니다.'})));
 section.append(band('판정 확인 · 양측 동의 · 지급',workflow.application));
 if(workflow.detail)section.append(band('확인한 근거',workflow.detail));
 if(operator)section.append(el('p.bcx-note',{text:'현재 연결된 신청 한 건만 조회합니다. 기수 전체 명단·금고 집계·운영 효과는 제공되지 않았습니다.'}));
 return section;
}
