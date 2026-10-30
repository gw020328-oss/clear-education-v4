# Reclaim 계정 결합 — 내 제안과 기존 설계 대조

2026-10-29. 프론트(서준형) → 오규원.

> **결정: pair proof 설계를 따른다.** 이메일 대조 제안은 철회했다.
> 화면도 그 설계에 맞춰 고쳤다 — 조건 상세가 증명 **둘**(계정 통제·인증서)과
> 그 결합을 따로 보여준다.

[이전 질문서](HACKERRANK_계정대조_질문.ko.md)에서 "남의 인증서 URL 을 그대로
내도 공증이 통과한다" 를 걱정하며 **이메일 대조**를 제안했다. 그 뒤 저장소를
더 읽었더니 **이미 그보다 강한 설계가 적혀 있었다.** 내 제안은 철회하고,
남는 질문만 아래에 정리한다.

## 이미 정해져 있던 것

`docs/current/PYTHON_BOOTCAMP_P0.ko.md` 의 조건 정의와 "인증서 의미와 증거
범위" 절이다.

> `python-basic-certificate / HACKERRANK_CERTIFICATE_HOLDING.1` —
> 신선한 조회 시점에 **본인 통제 계정과 대응하는** Python (Basic) 합격
> 인증이 issuer `status=test_passed` 로 존재

> P1은 **private account/dashboard 통제 증명과 공개 certificate 증명 둘 다**
> 검증해야 한다. **공개 인증서 하나만으로 신청자 소유를 확정하지 않는다.**
> 같은 signed username·claim owner 와 한 인증서 레코드의
> `certificateId`/`name`/`status` 를 결합한다. 요청에서 선택한 certificateId 가
> 없고 여러 후보가 남으면 **AMBIGUOUS/UNKNOWN 으로 보류**하고 `data[0]` 이나
> 고정 username 을 쓰지 않는다. 두 증명의 nonce/request·policy/criterion·
> participant/application/claim-owner binding 이 signed 원문 또는 검증 가능한
> protocol 관계에 있어야 한다. **unsigned wrapper hash 만 붙여 VERIFIED 로
> 표시하지 않는다.** 방법이 성립하지 않으면 requestBinding UNKNOWN·수락
> 비활성으로 보고한다.

`BOOTCAMP_SECURITY_COMPLETION_PLAN.ko.md` 가 이것을 "Reclaim **pair proof**"
라고 부르고, S4 판정 근거 manifest 가 그 참조를 담는다.

## 대조

| | 내 제안 (이메일 대조) | 기존 설계 (pair proof) |
|---|---|---|
| 증명 개수 | 1개 — 로그인해야 보이는 페이지 | **2개** — dashboard + certificate |
| 묶는 값 | CLEAR 로그인 이메일 == HackerRank 계정 이메일 | **같은 signed username + claim owner** |
| 공개 인증서만으로 충분한가 | 아니라고 봄 | **아니라고 명시** |
| 여러 인증서가 걸릴 때 | 생각 못 함 | AMBIGUOUS/UNKNOWN 보류, `data[0]` 금지 |
| 결합이 성립 안 할 때 | 생각 못 함 | requestBinding UNKNOWN·수락 비활성 |
| 변조 난이도 | 이메일은 프로필에서 바꿀 수 있다 | 프로토콜 수준 결합이라 더 어렵다 |

**기존 설계가 더 강하다.** 내 제안은 접는다. 화면도 이 설계를 전제로 두고
있다 — 운영자 검증 현황에 `증명 계정과 신청 계정이 다름` 이라는 실패 사유를
그릴 자리가 이미 있다.

## 그래도 남는 것 — 계정 대여

두 설계 **모두** 막지 못하는 경우가 하나 있다. 학생이 친구의 HackerRank
아이디·비번을 받아 로그인하면, dashboard 증명도 certificate 증명도 같은
username 으로 일관되게 나온다. signed username 결합은 통과한다.

여기서 **내장 지갑(B안)이 단서를 하나 더 준다.** 학생은 소셜 로그인으로
CLEAR 에 들어오므로 서버가 **학생의 소셜 이메일**을 갖는다. 그것을 HackerRank
계정 이메일과 대조하면, 친구 계정을 빌리려면 친구의 소셜 계정까지 빌려야 하고
그러면 **환급금이 친구 지갑으로 간다** — 빌릴 동기가 사라진다.

다만 `PYTHON_BOOTCAMP_P0.ko.md` 가 이 조건에 대해 **"실명 확인을 주장하지
않음"** 이라고 범위를 그어 뒀다. 이메일 대조는 실명 확인이 아니지만 신원
결합을 한 겹 더 요구하는 것이라 그 경계와 닿는다. 그래서 묻는다.

## 물어볼 것

1. **pair proof 가 구현됐나, 아직 설계인가.** `PRODUCT_STORE.ko.md` 는
   "원천/서명/계정 통제는 producer 책임이며 **현재 합성만 허용**" 이라고 적는다.
   P1 이 어디까지 됐나.

2. **claim owner 가 지갑 주소인가.** 그렇다면 **내장 지갑 주소도 claim owner
   로 쓸 수 있나.** 2026-10-29 팀 결정으로 학생은 내장 지갑(Privy·Web3Auth 류)을
   쓴다. 그 주소는 SDK 가 만든 EOA 다. Reclaim 결합에 문제가 없나.
   → 이게 **B안 채택의 가장 큰 기술 위험**이라고 본다. 답에 따라 지갑 결정을
   다시 봐야 할 수도 있다.

3. ~~소셜 이메일 대조를 추가할 수 있나~~ — **철회.** pair proof 로 간다.
   그러면 계정 대여는 막지 못한 채로 간다(아래 "받아들인 것").

4. **공증 대상 두 페이지가 어디인가.** dashboard 쪽 응답에 이메일이 들어 있나
   (있으면 3번이 공짜로 된다). 확인한 바로 공개 인증서 페이지
   (`hackerrank.com/certificates/<12자리>`)는 **로그인 없이 열리고 이름만
   보인다** — 날짜도 계정 식별자도 없다.

5. **화면이 무엇을 보여줘야 하나.** 지금 조건 상세의 `facts` 는
   `인증서 / 발급처 / 공증 / 증명 식별값` 네 줄이다. pair proof 라면
   **두 증명의 상태를 따로** 보여주는 쪽이 맞아 보인다. 서버가 주는 모양을
   알려 주면 그대로 그린다.

## 받아들인 것 — 계정 대여는 막지 않는다

pair proof 로 가기로 하면서, **친구의 HackerRank 아이디·비번을 빌려 쓰는
경우는 막지 않는 채로 간다.** 두 증명 모두 같은 계정에서 일관되게 나오므로
결합이 통과한다.

심사위원이 물으면 이렇게 답한다.

> 인증서 위조와 대리 제출은 막습니다. 공개 인증서 URL 만 가져오는 것도
> 막습니다 — 로그인해야 보이는 화면의 계정 통제 증명을 함께 요구하니까요.
> 계정을 통째로 빌리는 건 막지 못합니다. 그건 원천 플랫폼의 본인확인에
> 기대야 하는 영역입니다.

## 화면 쪽 현재 상태

- 조건 상세에 `서명 문구 받기` → `지갑으로 서명` 흐름이 있다. 서버에 세 경로가
  다 있고 지갑 서명이 가능할 때만 단추를 띄우고, 아니면 "이 서버에는 인증서
  확인 경로가 아직 없습니다" 라고 적는다.
- 운영자 검증 현황에 도구별 실패 건수와 사유를 그리는 자리가 있다.
- **두 증명을 따로 보여준다**(2026-10-29 반영). 조건 상세 `facts` 가
  `① 계정 통제 증명` · `② 인증서 증명` · `두 증명 결합` 세 줄이다.
  지금 값은 합성이고, 서버가 주는 모양이 정해지면 그대로 바꾼다(5번).
- 조건 설명도 바꿨다 — "증명을 둘 받습니다. 로그인한 화면으로 그 계정이
  본인 것임을, 인증서 페이지로 합격 사실을 각각 공증하고 둘을 같은
  계정으로 묶습니다."

## 출처

- [PYTHON_BOOTCAMP_P0.ko.md](../current/PYTHON_BOOTCAMP_P0.ko.md) — 조건 정의, 인증서 의미와 증거 범위
- [BOOTCAMP_SECURITY_COMPLETION_PLAN.ko.md](../current/BOOTCAMP_SECURITY_COMPLETION_PLAN.ko.md) — S4, Reclaim pair proof
- [PRODUCT_STORE.ko.md](../bootcamp-store/PRODUCT_STORE.ko.md) — 계정 통제는 producer 책임, 현재 합성만
- [HackerRank 공개 인증서 예시](https://www.hackerrank.com/certificates/b531ded8b1ab) — 로그인 없이 열림
