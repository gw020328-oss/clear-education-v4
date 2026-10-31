// 학생 화면 projection 시험 (§9.1 · §9.3)
//
// 여기서 고정하는 것은 하나다 — **서버가 주지 않은 것을 화면이 지어내지 않는다.**
//
// 기획서 §9.3: "미확인은 null이며 0으로 만들지 않음"
//              "현재 HTTP 응답에 그대로 존재한다고 가정하지 않는다"
//
// 수집 상태와 보완 가능성이 없는 필드를 그럴듯한 값으로 채우면, 학생은
// '연결 실패'와 '아직 안 봤음'을 구별할 수 없고 '다시 해도 안 됨'을 믿는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectionFrom, recoverabilityFrom, sourceLabel, metCount } from '../src/bootcamp/criteria.js';
import { BOOTCAMP_FIXTURES, bootcampView } from '../src/fixtures/bootcamp.js';

const cases = Object.keys(BOOTCAMP_FIXTURES.cases);

test('네 원천이 전부 이름을 가진다 — 서버 코드가 화면에 그대로 새지 않는다', () => {
  for (const id of cases) {
    for (const row of bootcampView(id, 'participant').criteria) {
      const label = sourceLabel(row.source?.kind);
      assert.ok(label, `${id} / ${row.criterionId}`);
      assert.notEqual(label, row.source?.kind, `${row.criterionId} 는 이름이 붙어야 한다`);
    }
  }
});

test('시험용 원천을 실제 학원 기록으로 보여주지 않는다', () => {
  for (const id of cases) {
    for (const row of bootcampView(id, 'participant').criteria) {
      const c = collectionFrom(row);
      // fixture 는 전부 SYNTHETIC_TEST_SOURCE 다. 이게 true 로 와야 화면이 경고한다.
      assert.equal(c.synthetic, true, `${id} / ${row.criterionId}`);
      // 실제 원천 검증은 아직 전부 null 이다. false 로 바꿔 '검증 실패' 로 읽히면 안 된다.
      assert.equal(c.realVerified, null, `${id} / ${row.criterionId}`);
    }
  }
});

test('보완 가능성은 서버가 안 주므로 전부 UNKNOWN 이다', () => {
  for (const id of cases) {
    for (const row of bootcampView(id, 'participant').criteria) {
      // 여기서 RECOVERABLE 이나 NOT_RECOVERABLE 이 나오면 화면이 추측한 것이다.
      assert.equal(recoverabilityFrom(row), 'UNKNOWN', `${id} / ${row.criterionId}`);
    }
  }
});

test('근거가 없는 조건은 collected 가 false 다', () => {
  const missing = bootcampView('missing', 'participant');
  const met = bootcampView('waitingForOperatorConsent', 'participant');

  // missing 은 네 조건 전부 UNKNOWN 이고 근거가 없다
  assert.equal(metCount(missing), 0);
  for (const row of missing.criteria) {
    assert.equal(collectionFrom(row).collected, false, row.criterionId);
  }

  // 충족 쪽은 네 개 전부 근거가 있다
  assert.equal(metCount(met), 4);
  for (const row of met.criteria) {
    assert.equal(collectionFrom(row).collected, true, row.criterionId);
  }
});

test('원문 조회 가능 여부를 null 과 false 로 구분한다 (§10.1)', () => {
  for (const id of cases) {
    for (const row of bootcampView(id, 'participant').criteria) {
      const c = collectionFrom(row);
      // fixture 는 originalEvidence.httpAvailable: false — 원문이 없는 상태다.
      // null(필드 자체가 없음)과 섞이면 '만료됐어요' 를 잘못 띄운다.
      assert.equal(typeof c.originalReadable, 'boolean', `${id} / ${row.criterionId}`);
      assert.equal(c.originalReadable, false, `${id} / ${row.criterionId}`);
    }
  }
});

test('필드가 없으면 조용히 비운다 — 던지지 않는다', () => {
  const bare = { criterionId: 'x', state: 'UNKNOWN', current: true };
  const c = collectionFrom(bare);
  assert.equal(c.label, null);
  assert.equal(c.synthetic, false);
  assert.equal(c.collected, false);
  // originalEvidence 가 아예 없는 것과 httpAvailable:false 는 다르다
  assert.equal(c.originalReadable, null);
  assert.equal(recoverabilityFrom(bare), 'UNKNOWN');
});

// ── 화면에서 어학원 반을 뺐는지 ────────────────────────────────────────
//
// 사용자 지시: "왜 자꾸 어학원 반 ybm 이런게 들어잇냐고 다 내보내라고"
//
// 보존과 노출은 다르다. fixture·시험·코드는 남기되 **화면 어디에서도
// 링크하지 않는다.** 주소를 잘못 쳐도 그쪽으로 떨어지지 않아야 한다.

test('모르는 주소는 전부 부트캠프로 간다 — 어학원 목록으로 떨어지지 않는다', async () => {
  const main = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'));

  // 화면에 어학원으로 가는 버튼이 없다
  assert.ok(!main.includes("text: '어학원 반 보기 (보존용)'"), '어학원 버튼이 남아 있다');
  assert.ok(!main.includes("text: '참가자 화면으로'"), '검토 화면의 어학원 링크가 남아 있다');

  // 빈 주소와 모르는 주소가 둘 다 부트캠프로 간다
  assert.ok(main.includes('if (parts.length === 0) return bootcampHome;'));
  assert.ok(main.includes("if (parts[0] !== 'applications') return bootcampHome;"));
});

test('부트캠프 화면 문구에 어학원 반 이름이 없다', async () => {
  const fs = await import('node:fs/promises');
  // 주석은 뺀다. 왜 분리했는지 적은 설명까지 막으면 이유를 못 남긴다.
  // 막으려는 것은 **화면에 찍히는 글자**다.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  for (const name of ['student-view.js', 'operator-view.js', 'panels.js', 'criteria.js']) {
    const src = stripComments(
      await fs.readFile(new URL(`../src/bootcamp/${name}`, import.meta.url), 'utf8'),
    );
    for (const word of ['YBM', '시원스쿨', '어학원']) {
      assert.ok(!src.includes(word), `${name} 의 화면 문구에 ${word} 가 있다`);
    }
  }
});
