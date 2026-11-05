# Moodle 학생 projection의 v63 소스 인수

2026-11-04. PR149의 preview/fence 통합과 PR152의 C1 학생/auth projection을 별도 이력 병합했다. PR149 자체와 기존 v60·v61·v62 guard 원문은 변경하지 않는다. 이 문서는 합성 소스 인수와 독립 경계 검토 기록이며, 실제 로그인·원천 수집·AI 호출·서명·지급·배포 결과가 아니다.

## 정확한 입력과 보호 범위

- PR149 입력: `54ca048b77dc605b3e2d2adaae0b8f83b8fe3049`.
- B 최종 입력: `5f528d7e65385ec92083fe43b79849dccffc2e07` (기존 `2fbd466d078cf7287ea4bc970b39c5b731adae63`에 미지원 auth schema 거부 우선순위 복원 1줄 포함).
- 병합 소스 후보: `1ca60b56c1b87384b2f6fb474f6fc14808c8f8e8`.
- 소스 정본: [v63 delta](../../specs/bootcamp/hackathon-test-moodle-student-source-delta-v1.json). 기존 보호 테이블의 auth service/store 2개는 정확한 before/after로 교체한다. student HTTP service는 기존 파일이지만 v62 테이블 밖에 있었으므로 보호 대상에 새로 추가하고 별도 reviewedSourceChanges에 before/after를 기록한다.
- 학생 서비스, projection 모듈과 전이 의존성을 포함한 신규 보호 경로는 13개다. 최종 source 224개, wallet build 입력 24개, 추가 보존 artifact 7개이며 중복을 제거한 후보 범위는 254개다.
- candidateHead는 이 범위의 실제 Git blob만 가리킨다. 전체 저장소 provenance를 주장하지 않는다. 그 뒤 작성한 v63 guard, delta, consumer, 검사 및 문서는 후보 blob 범위에 포함하지 않는다. delta→guard→단일 memory consumer→preservation의 별도 exact SHA 연결로 검증한다.

v63은 검토한 auth 2개가 정확한 after 지문일 때만 이전 guard 체인의 before 지문으로 대조한다. 마지막에는 모든 현재 source/wallet bytes를 after 테이블과 다시 대조한다. 임의 변경, 누락, 옛 파일로의 회귀를 허용하는 일반 예외가 아니다. 기존 v62 기록과 원문 SHA도 계속 확인한다.

## 독립 경계 검토

- auth schema4→5 전환은 명시적인 revision1/expected0과 같은 transaction 안의 metadata·authority 기록으로 이루어진다. 기존 세션과 데이터는 보존한다. schema5의 authority/metadata 유실과 묵시적 downgrade는 거부한다.
- 재승인은 영속 revision CAS를 요구한다. 같은 역할 설정으로 돌아와도 revision이 증가하며, 새 코드의 구 설정 worker는 현재 authority와 맞지 않으면 거부한다. manifest는 내부 서비스가 발행한 객체에 한정한다.
- 학생 policy disable→reenable은 같은 hash여도 binding_revision을 올린다. 현재 active policy, 신청 소유자·상태·revision·ack 및 승인된 registry를 함께 대조한다. 변경된 결합은 새 registry 승인과 새 attempt를 필요로 한다.
- source I/O는 transaction 밖에서 수행하고 최종 auth/workflow 조회·시간 fence·pending CAS·binding·audit는 원본 DB 잠금 안에서 검사한다. source DB 열 allowlist와 쓰기 금지를 유지한다. 반대 순서 잠금 충돌은 timeout/rollback으로 처리하며 자동 재시도하지 않는다.
- `5f528d7`은 알려진 schema0..5만 분기 진입하도록 제한한다. schema99는 기존 `DB_ENVIRONMENT_MISMATCH`로 거부하며 schema5 authority 검사를 우회하지 않는다.

검토한 합성 범위에서 새 차단 결함은 발견하지 않았다. 이미 실행 중인 과거 바이너리 종료, DB 전체 백업 rollback 감지, 기관 registry/운영 verifier와 HTTP 연결은 이 구현에 없다. 영속 revision의 의미를 DB 밖의 복구 fence나 실제 기관 신원 검증으로 확대하지 않는다. 자세한 제한은 [B projection 문서](MOODLE_STUDENT_PROJECTION.ko.md)를 따른다.

## 검증

고정 Node 24.21.0으로 통합 작업본에서 수행했다. 아래 결과의 소스 지문은 위 최종 후보를 기준으로 한다.

- auth migration/authority 4개 + student projection 18개 + vault 78개: 100/100 통과.
- E5 provenance: 8/8 통과. 후보의 254개 Git blob/현재 파일, 3개 정확한 before/after, v62 원문, 소스/record/guard 변조 시 runtime 생성 전 거부를 검사한다.
- 역사적 normal-source compatibility: 55/55 통과. 과거 guard는 그 당시 auth blob으로 검사하고 최신 소비자는 v63 after 지문으로 검사한다.
- E5 preservation 및 E5B source pins: 통과.
- stage execution: 48/48 통과. B의 소스 변경 뒤 지문 문제로 막혔던 47개도 포함한다. actualSources=0, externalRpc=0, persistentChains=0이며 합성 인메모리 TEST 실행이다.

공개 이력/작업본 검사 최종 결과는 PR 검증 기록에 함께 확정한다. 이전 B 후보 실행 중 소스가 교체된 stage 결과는 최종 증거에 포함하지 않는다. 원격 CI는 로컬 검사와 별도로 PR의 최신 exact head에서 확인한다.
