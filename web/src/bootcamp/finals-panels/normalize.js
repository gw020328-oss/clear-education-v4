// 읽기 제안 — 학원이 자기 말로 쓴 안내문을 모듈이 아는 문장으로
//
// `structureSynthetic` 은 규칙 기반이라 **문구가 정확히 같을 때만** 읽는다.
// "Moodle 활동 완료" 는 되고 "지정 강의 완료" 는 안 된다. 15개 표현을
// 넣어 봤더니 5개만 통과했다. 학원 담당자는 자기 말로 쓴다.
//
// 그래서 모듈에 넘기기 **전에** 한 단계를 둔다 — 조항마다 "이렇게
// 읽었습니다" 를 보여주고 운영자가 확인하면 그때 정규 문장으로 넘긴다.
//
// ── 이 파일이 **아닌** 것 ────────────────────────────────────────────────
//
// 모델이 아니다. 우리가 미리 적어 둔 표현만 잡는다. 못 잡으면 못 잡았다고
// 하지 지어내지 않는다. 최종 설계는 Gemini 가 제안하고 규칙이 검증하는
// 것이고(B 인계 0.3.0), 그 포트가 열리면 **이 제안자만 빠진다.** 확인 화면은
// 그대로 남는다.
//
// 원문을 고치지 않는다. 원문 조항과 읽은 결과를 나란히 두고 사람이 정한다.

/** 모듈이 실제로 받아들이는 정규 문장. 바꾸면 structureSynthetic 이 못 읽는다 */
export const CANONICAL = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': 'Moodle 활동 완료',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': 'Moodle 과제 제출',
  'REFLECTION_REQUIRED_TOPICS.1': '회고에 수행 내용, 문제해결 과정, 배운 점 포함',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'HackerRank Python (Basic) 인증서 보유',
});

/**
 * 조항을 자르는 자리 — 쉼표를 **전부** 자른다.
 *
 * 처음엔 연결어미("-고," "-며,") 뒤 쉼표만 잘랐다. 그랬더니 "출석률 90% 이상,
 * 해커랭크 파이썬 자격증" 이 한 조항으로 붙어 **출석률이 HackerRank 안에
 * 삼켜졌다.** 못 읽은 것이 읽힌 것 안에 숨는 것 — 제일 하면 안 되는 일이다.
 * 그래서 쉼표를 다 자르고, 쉼표가 든 유일한 정규 문장(회고 세 항목)만
 * 자르기 전에 보호했다가 되돌린다.
 */
/**
 * 문장 단위로 먼저 자른다 — 줄바꿈·세미콜론·마침표.
 *
 * 실제 안내문은 대부분 조건이 아닌 글이다(일정·환불 규정·연락처). 쉼표마다
 * 자르면 "(점수 미달 시, 1회 면제)" 가 둘로 찢기고 산문이 조각난다. 그래서
 * **문장을 통째로 두고, 한 문장에 조건이 둘 이상 들어 있을 때만** 쉼표와
 * 연결어미에서 더 나눈다. "강의 다 듣고, 숙제 내고" 는 둘로, "일정은 공지를
 * 참고하시고, 문의는 …" 은 한 덩어리로 남는다.
 */
const SENTENCE = /\n|;|\.(?=\s|$)/;
// '-고/-며/-서' 뒤 띄어쓰기에서도 나눈다. 단 '회고' 의 '고' 는 명사 끝이라 제외한다.
const SUB = /,|\s그리고\s|\s및\s|(?<=(?<!회)고)\s+|(?<=[며서])\s+/;
const PROTECT = /(수행\s*내용)\s*,\s*(문제\s*해결\s*과정?)\s*,\s*(배운\s*점)/g;
const SHIELD = '§';
/** 글머리표·대시. 원문 근거로 보여줄 때 떼어 낸다 */
const BULLET = /^[-–—•*·•]\s*/;
/** "[환급 기준]" 같은 제목 줄. 조항이 아니다 */
const HEADING = /^\[[^\]]*\]$/;

/**
 * 우리 조건이 **아닌** 것. 어느 규칙보다 먼저 본다.
 *
 * 출석률·수강률이 "강의" 와 한 조항에 있어도 활동 완료로 읽으면 안 된다.
 * 오규원: "학습 활동 완료를 영상 전체 시청이나 출석률 검증으로 확대해서
 * 설명하지 않는다." 학원이 그걸 요구했다면 못 한다고 말해야 한다.
 *
 * 메타코드 실제 안내문에 있는 것들이다 — 출석률 95%, 정답률 90%, 참석률 100%,
 * (선택) 인터뷰. 전부 운영자가 조건으로 **쓴 게 분명한데 우리가 못 하는** 것이라
 * 숨기지 않고 따로 알린다.
 */
const NOT_OURS = Object.freeze([
  // 문구는 본부 결정(11/4): "확인 안 함" 이 아니라 **자동 검증 미지원**이다.
  // 조건이 아니라는 뜻이 아니라, CLEAR 가 자동으로 못 보니 정책 확정 전에
  // 사람이 처리해야 한다는 뜻이다.
  [/\(\s*선택\s*\)|^선택\s*[:)]/, '선택 사항은 환급 조건이 아닙니다'],
  [/출석|출결/, '출석률은 자동 검증 미지원입니다. 정책 확정 전 처리가 필요합니다'],
  [/참석률|참여율/, '참석률은 자동 검증 미지원입니다. 정책 확정 전 처리가 필요합니다'],
  [/수강률|시청률|시청\s*시간/, '수강률·시청률은 자동 검증 미지원입니다. 강의 활동 완료 기록만 봅니다'],
  [/정답률|점수|점 이상|등급|만점/, '점수·정답률 기준은 자동 검증 미지원입니다. 정책 확정 전 처리가 필요합니다'],
]);

/**
 * 표현 규칙. 순서대로 본다 — 먼저 맞는 것이 이긴다.
 *
 * `exclude` 가 맞으면 그 조항은 **읽지 않는다.** 출석률이 대표다. 오규원이
 * "학습 활동 완료를 영상 전체 시청이나 출석률 검증으로 확대해서 설명하지
 * 않는다" 고 못 박았다. 출석은 우리 조건이 아니다.
 */
const RULES = Object.freeze([
  {
    capability: 'HACKERRANK_CERTIFICATE_HOLDING.1',
    any: [/hackerrank/i, /해커\s*랭크/, /헤커\s*랭크/],
    // 파이썬 언급은 있으면 좋고 없어도 읽는다. 우리 인증은 Python (Basic) 하나뿐이다.
    note: (t) => (/python|파이썬/i.test(t) ? null : 'Python (Basic) 으로 읽었습니다. 다른 인증이면 고쳐 주세요'),
  },
  {
    capability: 'REFLECTION_REQUIRED_TOPICS.1',
    // '후기' 는 "후기 인터뷰 촬영" 에도 나온다. 후기는 **쓰는 것**일 때만 회고다.
    any: [/회고/, /성찰/, /리플렉션/, /reflection/i, /후기.*(작성|쓰|적|남기|기록|게시|올리|블로그)/],
    // 세 항목이 안 적혀 있어도 회고 조건은 세 항목이다. 그 사실을 알린다.
    note: (t) => (/(수행|문제|배운)/.test(t) ? null : '세 항목(수행 내용·문제해결 과정·배운 점)은 조건에 포함됩니다'),
  },
  {
    capability: 'MOODLE_ASSIGNMENT_SUBMISSION.1',
    // '내' 한 글자는 "주차 내", "안내" 에도 있다. 제출을 뜻하는 꼴만 받는다.
    all: [/(과제|숙제|assignment)/i, /(제출|내고|내서|내야|내기|냅니다|내면|낸다|냈|올리|업로드|submit)/i],
  },
  {
    capability: 'MOODLE_ACTIVITY_COMPLETION.1',
    all: [/(강의|수업|활동|영상|lecture|activity)/i, /(완료|이수|수강|듣|들어|마치|완주|끝|complete)/i],
  },
]);

/**
 * 조건 **사이의 관계**를 바꾸는 말. (PR #164 리뷰 2)
 *
 * 지금 정규 문장은 "A; B" — **모두 필요**만 표현한다. "강의 수강 또는 과제 제출"
 * (둘 중 하나)이나 "과제 제출 대신 후기 작성"(바꿔치기)을 그 꼴로 옮기면 조건이
 * 더 엄격해진 채 "전부 읽었다" 고 말하게 된다. 그래서 한 문장에 조건이 둘 이상이고
 * 이런 말이 있으면 그 문장은 **자동으로 바꾸지 않고 보류**한다.
 *
 * '나' 한 글자는 "하나" 에도 있어서, 조건 낱말 바로 앞의 '나/이나' 만 본다.
 */
const CONDITION_WORD = '(?:과제|숙제|강의|수업|활동|영상|회고|후기|성찰|리플렉션|해커|헤커|hackerrank|assignment|lecture|reflection)';
const RELATIONS = Object.freeze([
  ['ALTERNATIVE', new RegExp(`또는|혹은|거나|택\\s*1|택일|중\\s*(?:하나|한\\s*가지|1\\s*개)|\\bor\\b|(?:이)?나\\s+(?=${CONDITION_WORD})`, 'i')],
  ['SUBSTITUTE', /대신|대체|갈음|\binstead\b/i],
]);

const RELATION_NOTE = Object.freeze({
  ALTERNATIVE: '조건 중 하나만 채우면 되는 문장(또는)으로 보입니다. 지금 형식은 "모두 필요" 만 '
    + '표현할 수 있어 자동으로 바꾸지 않았습니다. 어떤 조건을 요구할지 운영자가 정해 원문을 고쳐 주세요',
  SUBSTITUTE: '한 조건을 다른 조건으로 바꾸는 문장(대신)으로 보입니다. 지금 형식은 대체 관계를 '
    + '표현할 수 없어 자동으로 바꾸지 않았습니다. 최종 조건을 운영자가 정해 원문을 고쳐 주세요',
});

/** 이 문장이 조건 사이의 대안·대체 관계를 말하나. 조건이 둘 이상일 때만 본다 */
function relationOf(sentence) {
  if (distinctHits(sentence) < 2) return null;
  // 바꿔치기가 대안보다 구체적이다. 둘 다 있으면 대체로 본다.
  const found = RELATIONS.filter(([, re]) => re.test(sentence)).map(([kind]) => kind);
  return found.includes('SUBSTITUTE') ? 'SUBSTITUTE' : found[0] ?? null;
}

/** 이 조항에 서로 다른 조건이 몇 개나 들어 있나. 둘 이상이면 더 나눈다 */
// 한 문장에 서로 다른 조항이 몇 개 섞였나. **우리가 확인하지 않는 것도 한
// 조항으로 센다** — "출석률 90%, 해커랭크 보유" 를 통째로 '확인 안 함' 으로
// 묶으면 해커랭크가 그 안에 삼켜진다. 둘 이상이면 쉼표에서 나눈다.
function distinctHits(sentence) {
  const ours = RULES.filter((r) =>
    (r.any ? r.any.some((re) => re.test(sentence)) : true)
    && (r.all ? r.all.every((re) => re.test(sentence)) : true)).length;
  const notOurs = NOT_OURS.filter(([re]) => re.test(sentence)).length;
  return ours + notOurs;
}

/**
 * 원문 → 조항 목록. 문장 단위가 기본이고, 조건이 둘 이상 든 문장만 더 나눈다.
 * 글머리표는 떼고, "[환급 기준]" 같은 제목 줄은 조항으로 치지 않는다.
 */
function splitClauses(text) {
  const shield = (s) => s.replace(PROTECT, (_, a, b, c) => `${a}${SHIELD}${b}${SHIELD}${c}`);
  const clean = (s) => s.replaceAll(SHIELD, ', ').replace(BULLET, '').trim().replace(/[,.\s]+$/, '');
  const out = [];
  for (const raw of shield(String(text ?? '')).split(SENTENCE)) {
    const sentence = clean(raw);
    if (!sentence || HEADING.test(sentence)) continue;
    // 대안·대체 관계가 있는 문장은 쪼개지 않는다. 쉼표에서 나누면 "듣거나, 내거나"
    // 의 두 조각이 각각 '필수' 로 읽힌다. 통째로 두고 proposeReading 이 보류한다.
    if (distinctHits(sentence) >= 2 && !relationOf(sentence)) {
      for (const piece of raw.split(SUB)) { const p = clean(piece); if (p) out.push(p); }
    } else {
      out.push(sentence);
    }
  }
  return out;
}

/**
 * @param {string} text  학원이 쓴 안내문
 * @returns {{
 *   clauses: Array<{index:number, original:string, capability:string|null, canonical:string|null, note:string|null}>,
 *   readable: number, unreadable: number, held: number, duplicates: string[],
 *   canonicalText: string, complete: boolean,
 * }}
 *   대안·대체 관계로 보류한 조항은 `held:true`·`relation`·`mentions` 를 달고 canonical 이 없다.
 */
export function proposeReading(text) {
  const parts = splitClauses(text);

  const seen = new Set();
  const duplicates = [];
  let index = 0;
  const clauses = parts.flatMap((original) => {
    // 조건 사이에 대안·대체 관계가 있으면 그 조항은 **자동으로 바꾸지 않는다.**
    // 원문과 보류 사유, 문장에 보인 조건만 남긴다. 운영자 지정으로도 덮지 않는다
    // — 하나를 고르면 관계가 또 사라진다. 원문을 고쳐서 다시 읽게 한다.
    const relation = relationOf(original);
    if (relation) {
      const mentions = RULES.filter((r) =>
        (r.any ? r.any.some((re) => re.test(original)) : true)
        && (r.all ? r.all.every((re) => re.test(original)) : true)).map((r) => r.capability);
      return [{
        index: index++, original, capability: null, canonical: null,
        note: RELATION_NOTE[relation], held: true, relation, mentions,
      }];
    }

    // 우리 조건이 아닌 말이 들어 있으면 **다른 단어가 뭐든** 읽지 않는다.
    const notOurs = NOT_OURS.find(([re]) => re.test(original));
    // notOurs 표식을 남긴다. 운영자가 이걸 조건으로 지정하는 길을 막는 데 쓴다.
    if (notOurs) return [{ index: index++, original, capability: null, canonical: null, note: notOurs[1], notOurs: true }];

    // 한 조항에 조건이 **여럿**일 수 있다 — "강의수강 후기적기 과제제출" 처럼
    // 쉼표 없이 붙여 쓰면 쪼개지지 않는다. 그래서 첫 번째 하나만 고르지 않고
    // 맞는 조건을 모두 낸다. 같은 원문이 조건 수만큼 줄로 보인다.
    const hits = RULES.filter((r) =>
      (r.any ? r.any.some((re) => re.test(original)) : true)
      && (r.all ? r.all.every((re) => re.test(original)) : true));

    if (hits.length === 0) return [{ index: index++, original, capability: null, canonical: null, note: null }];
    return hits.map((hit) => {
      // 같은 조건이 두 번 나오면 두 번째는 세지 않는다. 모듈도 거부한다.
      if (seen.has(hit.capability)) {
        duplicates.push(original);
        return { index: index++, original, capability: hit.capability, canonical: null, note: '앞에서 이미 읽은 조건입니다. 한 번만 넘깁니다' };
      }
      seen.add(hit.capability);
      return {
        index: index++, original,
        capability: hit.capability,
        canonical: CANONICAL[hit.capability],
        note: hit.note ? hit.note(original) : null,
      };
    });
  });

  return finish(clauses.map((c) => ({ ...c, source: c.capability ? 'rules' : null })), duplicates);
}

/** 모듈에 넘길 때의 고정 순서. 운영자가 쓴 순서와 무관하게 이 순서다 */
const ORDER = Object.keys(CANONICAL);

/**
 * 읽은 조항을 모아 결과 모양을 만든다.
 *
 * canonicalText 는 **정규 순서**(활동 → 과제 → 회고 → HackerRank)로 잇는다.
 * 운영자가 "숙제, 강의" 로 써도 모듈에는 "활동; 과제" 로 간다. 그래야
 * 15가지 조합 fixture 가 전부 정확히 맞고 원문 위치가 어긋나지 않는다.
 * 읽기 제안 블록은 운영자가 쓴 순서 그대로 보여준다 — 그건 clauses 다.
 */
function finish(clauses, duplicates) {
  const kept = clauses
    .filter((c) => c.canonical)
    .sort((a, b) => ORDER.indexOf(a.capability) - ORDER.indexOf(b.capability));
  return Object.freeze({
    clauses,
    kept,
    readable: kept.length,
    unreadable: clauses.filter((c) => !c.capability).length,
    // 대안·대체 관계 때문에 보류한 조항. 하나라도 있으면 전체를 읽은 것이 아니다.
    held: clauses.filter((c) => c.held).length,
    duplicates,
    canonicalText: kept.map((c) => c.canonical).join('; '),
    complete: clauses.length > 0 && kept.length === clauses.length && !clauses.some((c) => c.held),
  });
}

/** 아무것도 안 읽은 상태. 제안자가 실패했거나 원문이 비었을 때 */
export const emptyProposal = () => finish([], []);

/** 운영자가 직접 고를 수 있는 것. 네 조건과 '조건 아님' */
export const MANUAL_CHOICES = Object.freeze([
  ...Object.keys(CANONICAL),
  'NOT_A_CONDITION',
]);

/**
 * 운영자가 못 읽은 조항을 직접 지정한다.
 *
 * `overrides` 는 `"index:원문" → capability | 'NOT_A_CONDITION'` 이다. 원문이
 * 바뀌어 번호나 글이 달라지면 키가 안 맞아 **조용히 버려진다** — 다른 문장에
 * 옛 지정이 붙으면 안 된다.
 *
 * 우리 조건이 아닌 조항(출석률 등)은 **조건으로 지정할 수 없다.** 그걸
 * 허용하면 운영자가 출석률을 활동 완료로 바꿔 넣는 길이 생긴다. 그런
 * 조항은 '조건 아님' 만 고를 수 있다.
 */
export function applyOverrides(proposal, overrides) {
  if (!overrides || overrides.size === 0) return proposal;
  const seen = new Set(proposal.clauses.filter((c) => c.canonical).map((c) => c.capability));
  const duplicates = [...proposal.duplicates];
  const clauses = proposal.clauses.map((c) => {
    if (c.capability) return c;                       // 규칙이 읽은 것은 손대지 않는다
    if (c.held) return c;                             // 대안·대체 보류 → 원문을 고쳐야 한다
    const choice = overrides.get(`${c.index}:${c.original}`);
    if (!choice) return c;
    if (choice === 'NOT_A_CONDITION') {
      return { ...c, source: 'operator', note: '운영자가 조건이 아니라고 표시했습니다' };
    }
    if (c.notOurs) return c;                          // 출석률 → 조건 지정 금지
    if (!CANONICAL[choice]) return c;
    if (seen.has(choice)) {
      duplicates.push(c.original);
      return { ...c, capability: choice, canonical: null, source: 'operator', note: '앞에서 이미 읽은 조건입니다. 한 번만 넘깁니다' };
    }
    seen.add(choice);
    return { ...c, capability: choice, canonical: CANONICAL[choice], source: 'operator', note: '운영자가 직접 지정했습니다' };
  });
  return finish(clauses, duplicates);
}
