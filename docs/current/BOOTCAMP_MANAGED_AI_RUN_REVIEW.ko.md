# 정상 시험별 AI 단회 기록 연결

2026-10-24. 기준 HEAD `1e923495380c81abf2eab13b21ec918ef2915495`의 r10 첫 정상 AI 진입점은 `artifacts/e6-first-normal-reflection-run/`의 이미 소비한 journal에 고정돼 있었다. 새 호스트와 승인만으로 이를 재사용할 수 없는 것은 정상적인 중복 방지 동작이다. 이번 변경은 기존 기록을 보존하며 다음 관리형 시험을 별도 단회 권한으로 연결한다.

## 경로와 승인 결합

- 실제 activation에서만 새 `normal-run-UUID`를 만들고 해당 관리형 host의 exclusive `run.used.json` v2에 저장한다. 준비 화면은 이 기록을 만들지 않는다. 기존 v1 실행 기록은 새 capability로 사용할 수 없다.
- 실제 진입점은 관리형 host 이름으로 발급한 private-brand capability를 받는다. 실제 파일 경로는 고정된 host 디렉터리 아래 `ai-reflection/`뿐이며, HTTP·승인·외부 인자로 임의 경로나 store/transport를 지정할 수 없다. 오프라인 capability는 실제 진입점에서 거부된다.
- 원천 회고 packet 준비 시 `ai-reflection-binding.json`을 exclusive 저장한다. host/run ID, 코드 HEAD, 참여자 지갑, 신청/참여자 ID, context/plan/input/body 지문, 모델, 원래 만료, 생성1/count0/retry0/fallback0을 결합한다. 같은 host에서 다른 입력이나 신청으로 바꿀 수 없다.
- 승인 요청과 template에 이 binding을 표시하고 `runBindingHash`를 요구한다. 기존 exact packet/code/day·가격 확인·직접 사용자 승인 증거와 마지막 dispatch 직전 검사를 그대로 유지한다. 키 읽기 직전까지 host/run/binding 변경도 다시 검사한다. 새 경로 생성 자체는 승인이 아니다.

## 소비·복구 경계

기존 `withE6PaidWireV3Store`의 exclusive 실행 lock·spent record·checkpoint를 사용한다. 최초 예약에서 run의 spent record와 고정 전역 디렉터리 `artifacts/e6-managed-normal-reflection-claims/`의 신청 및 승인 증거 소비 record를 모두 fsync한 뒤에만 dispatch할 수 있다. 같은 신청이나 승인 증거는 다른 host/journal에서도 다시 소비할 수 없다. 부분 예약, checkpoint 실패, 취소, 응답 불명은 소비를 되돌리지 않는다. 같은 run의 두 번째 호출과 동시 호출도 차단한다.

기존 첫 정상 journal이 존재하면 그 소비된 approval hash와 정확히 일치하는 승인 메타데이터를 고정 host namespace에서 읽기 전용으로 찾는다. 해당 승인 증거나 기존 plan/context의 재사용을 거부한다. 기록을 확실히 대조할 수 없으면 복구 필요 상태로 차단한다. r10의 approval/journal을 삭제·이동·초기화하거나 새 기준으로 덮어쓰지 않는다. 원천 본문·proof·쿠키·키·세션 기록을 읽지 않는다.

새 입력, 다른 신청, 다른 승인으로 relabel한 예전 권한은 허용하지 않는다. 새로운 신청·실행·exact 입력에 대한 새로운 직접 승인은 새로운 단회 사용을 허용할 수 있다. 생성1회·자동 retry/continuation/count/fallback0, 기존 Gemini 모델과 키 출처, 민감정보 수명·원천 만료·현재성·신청/지갑 결합은 그대로다. AI 결과는 지급 권한이 아니며 100 TEST 지급에는 기존의 실제 양측 동의가 필요하다.

## 검증과 준비

실제 네트워크를 막은 인공 fixture로 새/기존 기록 격리, 반복·동시 호출, 승인/신청 재사용, journal만 제거한 우회, 취소·응답 불명·checkpoint 실패, host/입력/모델 변경, 위조 capability·경로와 실제 entry의 fixture 거부를 확인한다. 실제 r10 승인과 소비 journal의 hash 연결은 값 출력 없이 일치 여부만 대조한다. 실행 수·최종 HEAD CI는 `BOOTCAMP_V20_VERIFICATION.json`과 PR #102의 해당 HEAD 기록을 따른다.

최종 CI 완료 후에만 다음 미사용 host의 prepare-only HTTPS/CA를 준비한다. 준비 단계에서는 `run.used.json`, 활성 승인, AI binding/spent record를 만들지 않으며 실제 로그인·원천 수집·증명·AI·서명·지급을 시작하지 않는다. 다음 실제 Gemini 호출에는 그때 준비된 exact 입력에 대한 새 사용자 승인이 필요하다.
