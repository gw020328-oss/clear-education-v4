# Fractional-second 취소 기한 수정

Base는 a002cf77e3b184596355379c4678f6973aa37464다. 이 문서가 포함된 commit이 수정 후보 head다.

C의 기존 exact6f4ea56 peer 재현을 재실행했다. fractional650ms에 시작한 요청은 exclusive deadline+32ms에도 pending이었고 +661ms에 PEER_TIMEOUT으로 끝났다. C 보고의 context 자연 만료 지연은 +721ms였다. 후자는 제공된 재현 기록을 근거로 삼았다.

기존 clock은 Unix integer seconds, monotonic은 milliseconds다. 두 injection 인자와 wire DTO를 유지하고 초 단위 clock의 다음 초 경계를 현재 시각의 보수적 상한으로 사용했다. peer의 잔여 시간은 (expiry - seconds - skew - 1)*1000, context는 (expiry - seconds - 1)*1000이다. sample 시점 monotonic에 더해 절대 monotonic deadline을 고정하며 timer arm까지 소요된 시간을 차감한다. peer의 최종 반환 검사도 같은 deadline을 사용한다.

이 선택으로 최대1초 조기 만료할 수 있다. 보장할 잔여 시간이 없으면 dispatch 또는 context 발급 전에 거부한다. timer 콜백은 JavaScript event loop가 실행 가능한 시점에 수행되며 최종 응답의 epoch·monotonic 검사는 함께 유지한다.

신규2개 회귀는 fractional650ms에 시작해 pending peer와 context observation을 두고 deadline+30ms에 취소·settlement를 확인한다. context 검사에서는 record/review/observe를 다시 호출하지 않고 idle 자연 만료를 기다린다. 취소된 관측 request의 CANCELLED 상태도 확인한다.

기존 guard 아래 peer18 + context21 =39 PASS. C의 coordinator 취소 검사3개도 현재 후보 경로로 적용해 PASS였다. pre-abort 무등록, 동기 취소 후 CANCELLED 및 late response 거부, 권한 폐기 뒤 cleanup이 OPEN을 변경하지 못하는 fence를 확인했다. 로그는 /tmp/clear-fractional-peer.log, /tmp/clear-fractional-context.log, /tmp/clear-fractional-coordinator.log다.

구현 변경은 peer-transport와 preview-context 두 파일이며 기존 A2 및 취소 후보 위의 별도 delta다. 정상 PHP/Node fixture 파일에는 변경이 없다. 실제 peer 연결 활성화는 본부 리뷰 이후 인수 항목이다.
