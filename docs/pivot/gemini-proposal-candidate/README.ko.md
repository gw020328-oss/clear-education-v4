# Gemini 조건 제안 화면 변환기 후보

프론트 담당이 명시적 제안 생성, 출처 배지, 보류 조항 표시를 준비하기 위한 E 검토 산출물의 고정 사본이다. 이 브랜치의 파일은 제품 화면에서 자동으로 사용되지 않는다.

## 가져올 파일

- condition-proposal.candidate.mjs — 순수 표시 변환기 toPanelProposal
- condition-proposal.candidate.test.mjs — 자체 생성한 응답 대역과 검사 10개

저장소 루트에서 실행한다.

```sh
./tools/node --test docs/pivot/gemini-proposal-candidate/condition-proposal.candidate.test.mjs
```

이 후보는 E 최초 검토 대상 PR #166의 93c849b 및 D와 논의한 additive 응답을 기준으로 한다. 원본은 2026-11-05 E 검토 폴더에 있던 파일 그대로다. 현재 서버 승인 또는 병합 완료를 의미하지 않는다.

## 준비할 화면

명시적인 제안 생성 버튼으로 요청을 시작한다. 원문 입력 변경은 표시·실행 지문을 무효화하며 입력마다 유료 모델을 호출하지 않는다. 규칙 기반, 실제 모델 응답, 합성 응답의 출처를 구분한다. 서버가 보류한 조항은 capability 직접 지정으로 지원 조건으로 바꾸지 않는다.

원문과 UTF-16 위치, sourceHash, bodyHash, proposalHash, 만료를 보존한다. 이 후보의 기본 실행 계약은 DISPLAY_ONLY다. 원문을 canonicalText로 조용히 재작성하지 않는다. 한 조항에 여러 조건이 있으면 현행 서버 계약에서 확인 필요로 처리한다.

## 최종 서버 계약과 맞출 부분

현재 후보 파서는 clear-external-preview-draft.1 및 clear-condition-proposal.1 응답만 받는다. B의 후속 .2 계약과 실제 호출 여부가 아직 미확정인 null 상태를 받도록 수정하는 작업은 이 고정 사본에 들어 있지 않다. null을 false로 바꾸거나 실제 호출 배지로 표시하지 말고, 최종 계약 인수 때 명시적으로 반영한다.

테스트의 응답 모양은 D HTTP에 구현된 실응답을 보장하지 않는다. 최종 DTO 버전, modelCall 계측, 보류 행 보존과 실행 가능 범위를 D/B/본부와 확인한 뒤 서버에 연결한다. 브라우저가 D의 HMAC 서버 간 포트에 직접 호출하거나 비밀값을 갖지 않는다.

실제 Gemini 호출, 실제 Moodle·Reclaim 실행, 지급, OAuth, 배포는 이 후보에서 수행하지 않는다. 실제 시험 환경 접속 시간은 본부가 A·C의 인증 시험과 조정한 뒤 안내한다.
