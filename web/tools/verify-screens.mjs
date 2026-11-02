// 모든 화면을 그려 보고 어긋난 데를 찾는다
class N {
  constructor(t){this.tagName=String(t).toUpperCase();this.children=[];this.attributes={};this.className='';this._text='';}
  get firstChild(){return this.children[0]??null;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent??'').join('');}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(){} append(...n){for(const x of n)this.children.push(x);}
  removeChild(n){this.children=this.children.filter(c=>c!==n);}
}
globalThis.document={createElement:t=>new N(t),createElementNS:(_,t)=>new N(t),createTextNode:t=>({textContent:String(t),children:[]})};
globalThis.crypto ??= { getRandomValues:a=>a.fill(7) };

const { studentSection, conditionDetail } = await import('../src/bootcamp/student-view.js');
const { operatorSection } = await import('../src/bootcamp/operator-view.js');
const { BOOTCAMP_CASES, bootcampView } = await import('../src/fixtures/bootcamp.js');
const { initialState, derive } = await import('../src/demo/world.js');
const { viewFor, cohortOf } = await import('../src/demo/view.js');

const CONN = { state:'LIVE', address:'0xabc123', recipient:'0xrecipient', walletKind:'EMBEDDED' };
const API = Object.fromEntries(['view','consent','operation','paymentReceipt','bindSourceSession',
  'pendingSourceSignature','submitSourceSignature','objection','revalidation'].map(k=>[k,()=>{}]));

const BAD = [
  // 해요체 '서술문'만 잡는다. '알려 주세요' 같은 정중한 요청문은
  // DESIGN.md §3 이 허용한다 — 사용자에게 말을 거는 문장이다.
  [/(어요|예요|에요)/, '해요체'],
  [/남음 뒤/, '문구 겹침'],
  [/undefined|null|NaN|\[object/, '값 샘'],
  [/[A-Z_]{6,}/, '서버 코드 노출'],
];

let problems = 0;
const check = (where, node) => {
  const t = node.textContent;
  for (const [re, name] of BAD) {
    const m = t.match(re);
    if (m) { console.log(`  ✗ ${where} — ${name}: "${t.slice(Math.max(0,m.index-30), m.index+50).replace(/\s+/g,' ')}"`); problems++; }
  }
  return t;
};

for (const id of Object.keys(BOOTCAMP_CASES)) {
  console.log(`\n■ ${id}`);
  const pv = bootcampView(id,'participant');
  const t = check(`${id}/학생`, studentSection({ view: pv, conn: CONN, api: API }));
  const head = t.slice(0, 60).replace(/\s+/g,' ');
  console.log(`  학생   ${head}`);
  check(`${id}/운영자`, operatorSection({ view: bootcampView(id,'operator'), conn: CONN, api: API }));
  for (const c of pv.criteria) {
    check(`${id}/상세:${c.criterionId}`, conditionDetail({ view: pv, criterionId: c.criterionId, api: API }));
  }
}
// ── 라이브 월드 ────────────────────────────────────────────────────────
//
// 학생 20명이 저마다 다른 단계에 있다. fixture 네 장보다 훨씬 많은 조합이
// 화면에 닿으므로, 전원을 한 번씩 그려 본다.

console.log('\n■ live (20명)');
const d = derive(initialState());
const cohort = cohortOf(d);
for (const row of d.rows) {
  const pv = viewFor(row, 'participant', d.now);
  check(`live/${row.name}/학생`, studentSection({ view: pv, conn: CONN, api: API }));
  for (const c of pv.criteria) {
    check(`live/${row.name}/상세:${c.criterionId}`,
      conditionDetail({ view: pv, criterionId: c.criterionId, api: API }));
  }
}
check('live/운영자', operatorSection({
  view: viewFor(d.rows[0], 'operator', d.now), conn: CONN, api: API, cohort, onDeposit: () => {},
}));
console.log(`  학생 ${d.rows.length}명 · 조건 상세 ${d.rows.length * 4}장 · 운영자 1장`);

console.log(`\n문제 ${problems}건`);
