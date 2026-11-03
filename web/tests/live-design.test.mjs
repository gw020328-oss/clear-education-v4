import test from 'node:test';import assert from 'node:assert/strict';
import {bootcampView} from '../src/fixtures/bootcamp.js';
import {studentSection} from '../src/bootcamp/student-view.js';
import {operatorSection} from '../src/bootcamp/operator-view.js';
import {evidenceDetail} from '../src/bootcamp/live-evidence.js';
import {el} from '../src/ui/dom.js';
function dom(){class N{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.events={};this._text='';}get firstChild(){return this.children[0]}set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(x=>x.textContent??'').join('')}setAttribute(k,v){this.attributes[k]=String(v)}addEventListener(k,v){this.events[k]=v}append(...n){this.children.push(...n)}removeChild(n){this.children=this.children.filter(x=>x!==n)}}globalThis.document={createElement:t=>new N(t),createElementNS:(_,t)=>new N(t),createTextNode:t=>({textContent:String(t),children:[]})};return()=>{delete globalThis.document;};}
for(const operator of [false,true])test('existing role design uses only bound view and owner actions '+operator,()=>{const restore=dom();try{
 const view=bootcampView('waitingForOperatorConsent',operator?'operator':'participant');let selected;
 const workflow={preparation:el('button',{text:'현재 승인 동작'}),application:el('p',{text:'연결된 지급 범위'}),summary:'현재 신청',openCondition:id=>{selected=id;},paid:false};
 const node=(operator?operatorSection:studentSection)({view,workflow});
 assert.match(node.textContent,/강의 수강/);assert.match(node.textContent,/회고/);assert.match(node.textContent,/현재 승인 동작/);
 assert.ok(!node.textContent.includes('충전하기'));assert.ok(!node.textContent.includes('20명'));
 const walk=n=>[n,...(n.children??[]).flatMap(walk)],details=walk(node).filter(n=>n.tagName==='BUTTON'&&n.textContent==='자세히');
 assert.equal(details.length,4);details[2].events.click();assert.equal(selected,'reflection-topics');
 }finally{restore();}});
test('S4 detail is scoped to current app, role and decision; no original text is invented',()=>{const restore=dom();try{
 const view=bootcampView('waitingForOperatorConsent','participant'),evidence={applicationId:view.applicationId,role:view.role,manifest:{decision:{decisionId:view.decision.id,decisionHash:view.decision.hash},criteria:[{criterionId:'reflection-topics',state:'MET',checks:{topics:[{topicId:'one',state:'PRESENT',location:{start:2,end:8}},{topicId:'two',state:'ABSENT'},{topicId:'three',state:'PRESENT'}]}}]},availability:[]};
 const read=()=>evidenceDetail({view,criterionId:'reflection-topics',evidence}).textContent;
 assert.match(read(),/one · PRESENT/);assert.match(read(),/two · ABSENT/);assert.match(read(),/2–8/);assert.match(read(),/원문 조회 API가 제공되지/);assert.doesNotMatch(read(),/보관 기한이 지났/);
 evidence.availability=[{criterionId:'reflection-topics',original:{status:'EXPIRED'}}];assert.match(read(),/보관 기한이 지났/);
 evidence.manifest.decision.decisionHash='other';assert.doesNotMatch(read(),/one · PRESENT/);
 }finally{restore();}});

test('condition preview shows source, selected tools and synthetic outcome, then clears it on edit',async()=>{
 const restore=dom();
 try {
  const {conditionPreview}=await import('../src/bootcamp/condition-preview.js');
  const panel=conditionPreview(()=>import('../../packages/clear-core/src/index.mjs'));
  const source=panel.children[2].children[1],run=panel.children[3],output=panel.children[4];
  output.replaceChildren=(...children)=>{output.textContent='';output.append(...children);};
  await run.events.click();
  assert.match(output.textContent,/Moodle 과제 제출/);
  assert.match(output.textContent,/moodle.assignment.public/);
  assert.match(output.textContent,/합성 자료에서 충족/);
  source.value='지원하지 않는 문장';
  source.events.input();
  assert.equal(output.textContent,'');
  await run.events.click();
  assert.match(output.textContent,/확인이 필요한 문구/);
  assert.doesNotMatch(output.textContent,/선택 도구|실행 결과/);
 } finally {restore();}
});
