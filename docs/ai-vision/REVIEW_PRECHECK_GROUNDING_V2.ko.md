# 보완 사유·근거 위치 개선 — 2026-10-16

**OFFLINE_IMPLEMENTED / REAL_MODEL_V2_NOT_TESTED.** PR72의 실제8건 원시 응답과 실행 원장은 보존했다. 이번 후속의 추가 실제 API/유료 호출은0이다. Sol/Medium 일반 구현 권장 및 위임 설정이며 현재 턴에서 모델을 별도 전환하거나 런타임 ID를 조회하지 않았다.

## 원인 분리와 수정

| 계층 | 기존 문제 | 이번 변경 / 한계 |
| --- | --- | --- |
| prompt v1 | null을 허용하지만 누락·판독불가 사유는 필수가 아니었음. line/row 자유 지시 | 새 `clear-review-evaluation-prompt.2`는 모든 필드의 OBSERVED/MISSING/UNREADABLE/CONFLICT/UNDETERMINED와 inspectedSourceIds를 필수 요구. 읽지 못하면 value/evidence 모두null. 위치 숫자를 추측하지 않음 |
| schema v1 | value=null·questions/flags=[] 조합이 유효. location은 임의 문자열 | v2는 필수 state와 구조화 evidence. 텍스트 TEXT_QUOTE 또는 이미지 IMAGE_ASSET만 허용. 자유 location/row/box는 없음. provider schema만으로 조건부 일관성을 보장하지 않으므로 로컬 validator를 함께 사용 |
| 후처리 | 사유 없는null을 UNOBSERVED로만 처리. location의 원문 대응 미검증 | 새 `grounding.mjs`: 텍스트 인용을 해당 원문에서 유일하게 정확히 찾은 경우에만 UTF-16 span을 계산. 반복/부재/다른출처/불일치 인용은 거부. 이미지에는 검증한 원본bytes SHA256과 sourceId의 전체 파일 참조만 제공. 행/영역 판독 보장은 하지 않음 |
| 평가기 | literal-only assessor는 requiredFlags·위치 정확성을 보지 않아8/8 PASS | 원래 평가/응답은 그대로 유지. v2 scorer는 값·state·증거 검증·보완 요청·정상 과잉 보류·원천 fixture 충돌을 함께 검사. null 값이 맞아도 UNDETERMINED를 UNREADABLE 정답으로 통과시키지 않음 |

v1 prompt/schema/승인 실행기와 지문을 바꾸지 않았다. 소진된 호출을 새 형식으로 다시 실행할 수 없도록 그대로 보존했다. v2 builder/preparer에는 provider transport·키 조회·실제 실행 경로가 없다. schema 변경은 담당 모듈 내부 proposal이며 공통 M1/C2/HTTP enum 변경이 아니다.

## 실제 응답의 오프라인 재생 결과

- RT01/RT04의 자유 위치 문구를 채택하지 않고 실제 제출 후기 원문에서 ALPHA가 유일하게 존재하는지 검사해 정확한 span을 복구했다. RT02의 정상 인용도 같은 코드로 검사했다. **텍스트3건의 exact span은 후처리 결과이지 모델이 정확한 위치를 새로 출력했다는 뜻이 아니다.** quote와 byte hash를 원본에 결합하며 Unicode 정규화나 임의 인코딩 변환은 하지 않는다.
- RV01/RV02의 잘못된 row3는 근거로 채택하지 않는다. 읽을 수 있는 이미지 후보값 ALPHA/BETA는 관찰값으로 보존하되 evidence=null/LOCATION_UNVERIFIED이며 별도 submittedSources에 원본 이미지 sourceId/hash만 둔다. 이미지 내부의 정확한 위치는 복구하지 못했다. 읽지 못한null은 NO_LEGIBLE_EVIDENCE이며 가짜 quote·행 번호를 만들지 않는다.
- RT03/RV02/RV03는 기존 응답에 사유가 없으므로 **정답표를 이용해 MISSING/UNREADABLE을 채우지 않는다.** UNDETERMINED/REASON_NOT_PROVIDED로 남기고 ‘항목을 확인할 수 있는 원문 또는 선명한 자료를 보완해 주세요. 누락인지 판독불가인지 아직 확인되지 않았습니다’라는 고정 보완 요청을 제공한다. 실제 모델의 세부 사유 누락3건이 새로 해결됐다고 보고하지 않는다.
- 정상 대조군3건의 후보값과 관찰 상태를 유지해 새 의미상 과잉 보류0/3을 확인했다. 이는 저장 응답을 재사용한 결과다. 이미지의 원래 근거 한계를 숨기거나 정상 이미지의 내부 위치까지 검증됐다고 표시하지 않는다. 기존 scoped 질문/flag가 있는 필드는 NEEDS_REVIEW를 유지하며 matching quote만으로 보류를 지우지 않는다.
- RV04는 후보BETA와 API fixture ALPHA의 충돌을 그대로 보존했다. 실제 Moodle 사실·게시·작성자 인증 시험은 아니다. v2의 합성 명시 상태 fixture에서도 정상3건과 충돌1건이 유지되며 누락/판독불가는 서로 다른 사유·고정 보완 요청·evidence=null로 표현한다. **합성 v2 응답 시험이지 실제 v2 모델 성능은 아니다.**

## 호스트 연결 제안

`grounding.mjs`는 순수 transient 검토 도우미다. 공통 source receipt/run·policy·submission revision 결합이나 인증/영속 CAS를 새로 구현하지 않는다. 향후 공통 host는 기존 RunContext/정책에 고정된 fieldIds와 서버 보유 제출 source만 전달하고 현재 run/CAS가 수락한 관찰에만 이 도우미를 적용해야 한다. browser가 sourceId/원문/hash를 스스로 선택해 검증 결과로 올리는 경로를 만들지 않는다.

텍스트 source는 `{sourceId,kind:TEXT,text}`이며 원본 UTF-8 bytes hash는 코드가 계산한다. 이미지 source는 `{sourceId,kind:IMAGE,bytes,sha256}`를 실제 보유 원본bytes와 대조한다. sourceId는 해당 호스트 run 안에서 유일해야 한다. 해시가 맞다는 것은 원본과 같은 bytes라는 뜻이며 원천 진위나 정책·신청 인증은 아니다.

v2 필드는 `{fieldId,state,value,evidence,inspectedSourceIds}`다. OBSERVED 텍스트의 evidence는 `{kind:TEXT_QUOTE,sourceId,quote}`이고 quote=value가 해당 source에 유일하게 존재해야 한다. 서버가 span/hash를 추가한다. 이미지 evidence는 `{kind:IMAGE_ASSET,sourceId,quote:null}`로 원본 파일에만 대응한다. MISSING/UNREADABLE/CONFLICT/UNDETERMINED는 value/evidence 모두null, 확인한 sourceId만 남긴다. 구체 보완 요청은 모델 자유 문구 대신 state에 따른 코드 고정 문구로 생성한다. 이미지 내부의 세부 영역이 필요하면 별도 host-issued crop/region 원본 결합 계약을 먼저 합의해야 한다. 현재 imageDecodeReady=false를 해제하지 않는다.

반환 quote/후보값/원문은 임시 관찰 자료로 제한한다. C2 receipt/DB/로그에 전체 반환 객체를 저장하지 않는다. 요약과 hash만 남기는 공통 연결은 담당자의 후속이다. 요청 또는 출력의 state는 모델 관찰이지 최종 requirement 충족·자격·지급 판정이 아니다. 서로 다른 값을 자동 선택하지 않는다.

## 검증과 새 평가 제안

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/*.test.mjs tests/document-precheck/*.test.mjs tests/ai-policy/*.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs tests/ai-review-precheck/prepare-grounded-evaluation.mjs
./tools/node tools/verify-workspace.mjs
```

로컬156/156 PASS(담당40+기존 AI/document116), verify:workspace PASS, diff-check PASS. 새 시험은 실제 응답 재생, 중복/없는 인용, 다른source, 조작한 이미지bytes, 허위row/offset, 기존 scoped hold 보존, 명시적누락/판독불가·사유미확정 구분, v2 값만맞는오판거부를 포함한다. 기존 root CI에 담당 경로 glob은 없으며 직접 변경하지 않았다.

`prepare-grounded-evaluation.mjs`는 동일 합성8건의 v2 requests/gold/plan과 legacy replay를 Git 제외 `artifacts/review-precheck-grounded-v2/`에 준비한다. 모델에는 gold/API 비교값을 보내지 않는다. request SHA256 `bfbc18c317c47afa010ce346bf14cf33827d4e63ca2a2a7f1ff79928b63b02f6`, gold SHA256 `4b821026b66b6b50ba63021d8036b46bd3dd6c6797129b1aba560e78e3522d01`이다. 원래 합성 PNG를 hash 대조해 재사용했고 새 이미지/실제 학생 자료는 없다.

**추가 실제 평가 승인은 아직 없다.** 기존 실패7개 관찰(사유3·위치4, 중복RV02)과 정상3개·충돌1개·문서명령 사례를 같은 기준으로 모두 비교하려면 동일8건을 v2로 각1회 평가하는 안을 제안한다. 생성최대8+countTokens최대8(총16요청), Gemini3.5 Flash-Lite/MINIMAL, 출력각1024, 입력text각2000/image각3000, 재시도0, 총상한USD0.05다.2026-10-16 가격 기준 생성예약USD0.02648/count입력까지보수예약USD0.03248이며 실행시 가격을 재확인한다. 세금/실청구는별도이고 이전 승인원장은재사용하지 않는다. 일부만 시험하면 모든 기존 사례와 과잉 보류0/3·충돌의 새모델 퇴행 여부까지 확인할 수 없으므로8건을 최소 회귀안으로 제시한다. 사용자 확인 전 유료 실행하지 않는다.

400/500 제외, 예치·PG·72/120시간 미확정, C2 공개합성 업로드/수명 제한, source/author UNVERIFIED, automaticEligibility/paymentAllowed=false, 독립 청구NO_GO는 유지한다. 공통schema/HTTP/DB/package/CI/web와자금/판정 코드는 변경하지 않는다.
