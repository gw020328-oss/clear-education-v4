# backend 후속 직접 코드 리뷰

2026-10-17. PR73 이후 `backend/`, 루트 `backend.test.mjs`, 보존한 `compact/`·`field-code/` 실험과 안내 문서를 주 세션에서 직접 검토했다. 별도 사람 승인·독립 보안 감사는 아니다. 실제 실행/지문의 수치는 verification.json과 Draft PR의 정확한 HEAD/checks를 따른다.

## 발견 사항과 수정

| 항목 | 근거 | 처리 |
| --- | --- | --- |
| 구형 native의 잘린 proof 입력 abort | 정상 proof에서 마지막 바이트 제거 후 native가 정상 exit1 대신 signal로 종료 | proof 길이 2,144바이트와 고정 VK 1,779바이트/SHA256을 native 호출 전에 확인. 정상 길이 앞/뒤 변조는 실제 exit1로 거부해야 시험 통과. abort/timeout을 PASS로 세지 않음 |
| sandbox 허용 경로 정규화 | 최초 새 runner의 경로에 `//`가 생겨 약 276초 계산 후 proof 파일 쓰기가 거부됨 | base를 정규화, 비정규 경로 거부 시험, 정확한 sandbox에서 출력 폴더 쓰기 사전 검사 추가. 실패 실행은 성공 측정에서 제외 |
| native 내부 shell 경로 | 고정 upstream get_bytecode.hpp에서 JSON/gzip 파일 경로를 double-quoted shell에 사용 | 실행 경로의 따옴표·역슬래시·달러·backtick·개행/NUL 거부. 고정 artifact 경로만 runner가 생성하며 외부 witness/claim 경로를 CLI에서 받지 않음 |
| 잘못된 backend/완료 표시 | CLI 기본 banner는 ultra_honk이나 OLD_API dispatch는 UltraPlonk. 회로 public input 0개 | 실제 dispatch·VK·생성 Solidity로 구분. 공식 signer/신청/정책 통합 성공, 실제 YBM, 공개 체인 성공으로 기록하지 않음 |
| cache/네트워크 경로 | OLD_API가 -c 옵션을 무시하고 HOME에 공개 setup을 만들 수 있음 | 최소 환경에서 HOME 미상속, 전용 cwd `.bb-crs`, prove 전 binary/source/program/CRS pin 확인, OS 네트워크 차단. 전역 HOME 재정의 없음 |
| 동일 회로의 raw VK 비결정성 | 두 생성의 program과 115개 VK fields는 같지만 비활성 accumulator 인덱스 64바이트 영역 안에서 11바이트 차이 | 정확한 고정 버전·1,779바이트 배치·두 비활성 flag를 확인한 뒤 해당 영역만 0으로 정규화하고 전체 SHA256 pin 검사. native/EVM은 정규화 VK를 사용. 다른 commitment/헤더·활성 flag 거부 회귀. proof 재생성 없이 이미 성공한 생성 결과에서 검증 단계만 재개 |

## 범위 검토

- PR69/73의 회로 소스와 과거 verification.json은 변경하지 않았다. 기존 v1 증명 경로와 v2 host/ACVM의 의미를 바꾸지 않는다.
- `compact/`·`field-code/`는 채택 실패한 실험의 소스/측정 근거 보존이다. 해당 회로의 전체 음성 사례 검토를 완료했다고 주장하지 않으며 기본 prover가 import하지 않는다.
- native 생성기 입력은 코드에 있는 공개 합성 표뿐이다. 실제 claim/login 입력·제품 adapter·private directory 접근은 추가하지 않았다. witness 파일을 쓰는 경로는 공개 합성 전용이며 실제 메모리 경계 구현이 아니다.
- resource timeout은 자기 child를 종료하고 close를 기다린다. RSS는 표본이고 native가 만드는 전체 트리의 강제 memory quota는 아니다. sandbox는 네트워크/쓰기 경계이며 read 격리나 메모리 완전 소거를 보장하지 않는다.
- common src/schema/HTTP/DB/web/Moodle/AI/CI/package 변경 없음. 400/500% 제외, 예치율·배정·PG·회수·분쟁 OPEN, grant/outbox HOLD와 독립 청구 NO_GO 유지.

공개 합성 parser 구성요소의 backend 우회에는 미해결 blocker를 남기지 않는 것이 목표다. 통합 서명 회로·원천 의미·안정적인 중복 방지·실제 collector·release lifecycle은 명시적인 후속 제품 관문이며 이 리뷰로 해제하지 않는다.
