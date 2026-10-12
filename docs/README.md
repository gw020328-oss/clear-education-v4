# CLEAR 문서

2026-10-12 02:40 UTC 확인: PR #1~#4는 develop에 병합됐고 main에는 아직 반영되지 않았습니다. 최신 상태·정확한 근거 커밋·CI는 [개발 현황](status.md)을 먼저 확인하세요. 실제 YBM 증명 1쌍의 생성·독립 검증 기록과 제품 자격·지급 완료를 구분합니다.

## 처음 보는 분

| 문서 | 내용 |
| --- | --- |
| [프로젝트 소개](../README.md) | 목적·기능·테스트 시작 방법 |
| [아키텍처](architecture.md) | 데이터 흐름과 기술별 역할·신뢰 경계 |
| [개발 현황](status.md) | 확인한 결과, 미완료 범위, 다음 단계 |
| [개발 가이드](development.md) | 설치·환경 준비·테스트·문제 해결 |

## 제품과 구현 설계

- [최신 Mac MVP 범위](current/MAC_MVP.ko.md): 승인된 저장·TEE 변경, 실제/합성 완료 기준과 목표 일정
- [합성 ZIP 사용 안내](current/MAC_TOOL_GUIDE.ko.md): 기존 Mac 저장 경계 도구의 실행·정리·한계
- [PRD](reference/PRD.ko.md): 원래 MVP 규칙과 완료 기준; 변경 범위는 위 Mac MVP 문서 우선
- [기술 설계](reference/DESIGN.ko.md): 서명·지급 권한·저장·복구
- [구현 계획](reference/IMPLEMENTATION_PLAN.ko.md): 단계와 의존 관계
- [기존 구현 감사](reference/AUDIT.ko.md): 기존 코드와 저장된 실행 근거

## 실험 기록

- 최신 W02: [동일 client 새 YBM 증명 생성·독립 검증](w02/YBM_PROOF_REPORT.ko.md), [공개 검증 기록](w02/ybm-proof-verification.json): 실제 성공 실행 `1a99de4`, 최종 수정 `0a08b4e`, PR #4 develop 병합
- 선행 W02: [신청·지갑 결합과 원천 형식 진단](w02/YBM_BINDING_REPORT.ko.md), [진단 기록](w02/ybm-binding-verification.json), [YBM 접속 경로](w02/YBM_ROUTE_REPORT.ko.md)
- Mac 저장 경계: [구현·합성 패키지 결과](w02/MAC_STORAGE_REPORT.ko.md), [PR #1 종료·복구 보정](w02/PR1_FIX_REPORT.ko.md)

- W01: [환경 준비 결과](w01/REPORT.ko.md)
- W02: [합성 검증 결과](w02/REPORT.ko.md), [검증 상태 JSON](w02/verification.json)
- [기존 YBM 경로의 v4 적용 설계](w02/V4_ROUTE_DESIGN.ko.md)
- [수동 provider 작성 도구 진단](w02/SESSION_DIAGNOSIS.ko.md)

W01·W02 문서는 당시의 작업 기록입니다. `merged:false`·Draft 표기는 과거 기록으로 보존하며 현재 병합 여부는 [개발 현황의 PR 링크](status.md)를 따릅니다. 초기 400개와 후속 407개 시험은 각 실행의 기록이며 더하지 않습니다. 이번 문서 확인은 실제 로그인·증명 재실행이 아닙니다. 오래된 판단과 후속 정정이 함께 있는 문서는 최신 정정 절과 검증 상태를 먼저 확인하세요. 외부에 제공하지 않는 실험 원본은 ‘비공개 로컬 자료’로 표시합니다.

## 문서 구성 참고

소개·시작 방법·기능·상세 문서를 구분하는 구성은 아래 공식 안내와 공개 프로젝트를 참고했습니다. 해당 프로젝트의 기술 선택이나 보안 보장을 CLEAR가 그대로 갖췄다는 뜻은 아닙니다.

- [GitHub: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2)
- [Reclaim Onchain Starter Kit](https://github.com/reclaimprotocol/reclaim-onchain-base-starterkit)
