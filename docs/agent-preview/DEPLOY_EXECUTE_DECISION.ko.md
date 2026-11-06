# D execute 연결 결정안 (결정 전 제안)

작성: 2026-11-06. 사용자·메인이 고를 선택지를 정리했다. 이 문서는 구현 기록이 아니다. 지금 코드는 **503 유지** 상태다.

## 1. 현재 상태(코드 근거)

| 위치 | 동작 |
|---|---|
| D `service.mjs` execute | draft·원문·검토 지문·계획 검사를 통과한 뒤 단계가 1개이고 `moodle.activity.public`인지 확인한다. 그다음 `observationAdapter.execution==='OFFLINE_TEST'`가 아니면 `OBSERVATION_ADAPTER_NOT_ACCEPTED`(HTTP 503)를 낸다. 배포 런타임(`runtime.mjs`)은 adapter를 넘기지 않으므로 항상 503이다 |
| D 관측 형태 | 정확 `{targetRef, status, observedAt}`. status는 COMPLETE/INCOMPLETE/UNKNOWN/INACCESSIBLE, observedAt은 Unix 초이며 30초 이내여야 한다. `eligibility:'NOT_EVALUATED'`, `paymentAllowed:false` |
| B relay execute | 기본 `executionContract='DISPLAY_ONLY'`라서 D를 부르지 않고 `PREVIEW_DISPLAY_ONLY`를 낸다. `D_SINGLE_ACTIVITY_OFFLINE.1`일 때만 D를 부른다. 이때도 응답의 `executionMode==='OFFLINE_TEST_ADAPTER'`와 `executionBridge==='PENDING_B_C_APPROVED_BINDING_ADAPTER'`만 받는다 |
| 권한 원칙(D README·FIRST-EXTERNAL-RUN) | 운영자 configure 권한과 서비스 HMAC은 학생 기록 접근 권한이 아니다. 실제 학생 기록 접근은 학생 본인의 B 인증·현재 신청·binding 경로로만 한다 |
| peer 런타임 후보(`peer-*.mjs`) | B 서명 봉투 + `observation-result` 경로가 있다. B가 학생 권한과 C 관측을 검증한 뒤 triple만 D로 보낸다. 다만 등록 1건당 120초 단일 context이고, develop의 운영자 중계(v0 HMAC)와는 연결되지 않는다 |

결론: execute를 연결하려면 D뿐 아니라 **B relay의 실행 계약과 A의 Moodle 읽기 adapter**가 함께 바뀌어야 한다. D 혼자 503을 풀어도 B가 거부한다.

## 2. 선택지

### 옵션 1 — 503 유지, "검증 모듈 실행 미연결" 표시 (본선 r34 권장)

- 실제로 보이는 범위: 운영자 원문 → (외부) Gemini 구조화 → 등록 도구 매핑 → 계획 검사까지. 실행 단계는 "미연결"로 표시한다.
- 허용 도구의 실제 읽기는 학생 정상 흐름에서 이미 실행되는 활동 완료 확인(r33/r34 네 조건 중 "지정 활동 완료")으로 따로 보여 줄 수 있다. 이것은 운영자 미리보기의 실행 결과가 아니므로 화면·발표에서 섞지 않는다.
- 새 코드 없음, 새 권한 경계 없음, 위험 최소.
- 기록 표현: "외부 모델 호출 성공(배포·승인 후)" + "도구 실행 미연결". "외부 AI 서비스 흐름 성공"이라고 쓰지 않는다(개발 계획 경계 6).

### 옵션 2 — 로컬 수집·최소 결과 전달 (연결한다면 이 방식 권장)

D는 Moodle에 닿지 않는다. 권한을 가진 로컬 CLEAR 서버가 읽고, D에는 결과 triple만 보낸다.

```
운영자 「실행」 → A /bootcamp/preview/execute
  B relay: 검토 READY, 계획 1단계 moodle.activity.public, 현재 세션·강좌 권한 재확인
  A: capability MOODLE_ACTIVITY_COMPLETION.1 → 등록된 읽기 모듈 → 강좌에 연결된 Moodle 대상(C binding)
     로컬에서 읽기 1회 → {targetRef, status, observedAt}
  A → D POST /v1/preview/execute (HMAC) 본문에 observation 추가
  D: draft·검토 지문·계획을 다시 검사하고 triple 형식·30초 신선도 확인
     → executionMode 'LOCAL_CLEAR_SERVER_READ', eligibility 'NOT_EVALUATED', paymentAllowed false
  B: 새 실행 계약으로 응답 검사 → Moodle에 "외부 AI 계획 검사 + 로컬 CLEAR 서버 읽기" 출처를 나눠 표시
```

필요한 변경과 담당:

| 담당 | 변경 |
|---|---|
| 배포(D, 이 브랜치 범위) | execute 본문에 `observation` 허용(새 응답 버전), `LOCAL_CLEAR_SERVER_READ` 라벨, 기존 503 경로는 observation이 없을 때 유지, 시험 추가. 예상 1–2시간 + 독립 검토 |
| 메인(B relay, `src/agent-preview`) | 새 `executionContract`(예: `D_SINGLE_ACTIVITY_LOCAL_READ.1`), 응답 검사 갱신, 읽기 직전·직후 권한 재확인 |
| 메인(A) | 등록 읽기 모듈 adapter. r33에서 쓴 활동 완료 원천 경로를 재사용하고 새 Moodle API는 만들지 않는다 |
| C | 강좌 대상(활동) 매핑 확인. 새 화면 문구 |

**사용자 결정이 필요한 권한 문제**: 운영자 미리보기에서 "무엇을" 읽을지다.

- (a) **강좌 구조 확인**: 대상 활동이 강좌에 있고 완료 추적이 켜져 있는지 확인한다. 운영자 권한 안에서 끝나고 학생 기록을 읽지 않는다. 다만 D의 현재 status 집합(COMPLETE…)과 의미가 달라 새 capability 정의가 필요하다.
- (b) **시연 학생 1명의 완료 기록**: 의미는 D 형태와 그대로 맞는다. 하지만 운영자 권한으로 학생 기록을 읽게 된다. 기존 원칙(운영자 HMAC·configure ≠ 학생 권한)과 충돌하므로, 시연 계정 한정 예외를 사용자가 명시적으로 승인해야 한다.

위험: 본선 당일에 새 계약 3곳(D·B·A)을 바꾼다. 실패하면 r34 정상 지급 회귀와 같은 실행본에 영향을 줄 수 있다. 그래서 정상 지급 회귀가 끝난 뒤 별도 실행에서만 시도하는 것을 권한다.

### 옵션 3 — 제한된 서버 연결 (비권장)

D가 터널로 로컬 CLEAR/Moodle의 좁은 읽기 엔드포인트를 직접 부르는 방식이다.

- Mac에 들어오는 공개 경로가 생긴다. 지급 키·RPC가 있는 호스트의 공격면이 넓어진다.
- "로컬 Moodle을 외부에서 직접 읽지 않는다"는 지시와 개발 계획 경계 3·5에 어긋난다.
- D의 HMAC·운영자 범위로 학생 기록에 접근하는 구조가 된다.

### 참고 — peer 런타임(장기안)

학생 본인 인증을 거친 B 서명 봉투로 triple을 넘기는 설계는 이미 `peer-*.mjs`에 후보로 있다. 학생 흐름의 "AI 검증 결과 기록"에는 이 방향이 맞다. 다만 단일 context·120초 수명, B vendor 계약 고정(`7dd6e38`), 운영자 중계와 별도 프로토콜이라 본선 범위 밖이다.

## 3. 제안

1. **r34(본선)**: 옵션 1. execute 503을 "검증 모듈 실행 미연결"로 표시하고, 외부 모델 호출과 도구 실행을 따로 보고한다.
2. **시간이 남고 사용자가 (a)/(b)를 고르면**: 정상 지급 회귀가 끝난 뒤 옵션 2를 별도 실행본에서 시도한다. D 쪽 변경은 이 브랜치에서 준비할 수 있다. B·A 변경은 메인 소유다.
3. 옵션 3은 하지 않는다.

## 4. 보고 표기 규칙

| 상황 | 표기 |
|---|---|
| 배포된 D가 Gemini 응답을 받고 B가 draft를 수락 | 외부 모델 호출 성공 |
| 위 + execute 503 | 도구 실행 미연결 |
| 옵션 2 연결 후 A가 로컬에서 읽고 D가 결합 | 도구 실행 성공(로컬 CLEAR 서버 읽기), 외부 AI 서비스 흐름 성공 |
| 오프라인 adapter·녹화 재생 | 오프라인 시험/대역. 실제 실행으로 쓰지 않음 |
