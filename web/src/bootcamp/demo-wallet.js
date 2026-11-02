// 시연용 가짜 지갑
//
// 서버가 아직 안 켜져 있고(PREPARED_NOT_ACTIVATED) 내장 지갑 SDK 도 아직
// 없다. 그런데 발표에서는 "계정 연결 → 수령 계정 등록 → 조건 화면" 흐름을
// 보여줘야 한다. 심사위원 노트북에 지갑 확장이 깔려 있을 리도 없다.
//
// 그래서 **아무것도 없을 때만** 도는 가짜를 둔다.
//
// ── 반드시 지킬 것 ──────────────────────────────────────────────────────
//
// 1. 서버가 살아 있으면 쓰지 않는다. OFFLINE 일 때만 켜진다.
//    진짜 서버에 가짜 서명을 보내면 그건 가짜 로그인이지 시연이 아니다.
// 2. 서명이라고 부르지 않는다. 아무것도 서명하지 않는다 — 난수를 돌려준다.
// 3. 화면이 가짜라고 말한다. 숨기면 시연이 아니라 속임수가 된다.
// 4. 주소는 매번 새로 만든다. 고정된 주소를 쓰면 누군가 진짜로 착각한다.
//
// 실제 B안 SDK 가 들어오면 이 파일은 지운다. 그때는 `window.clearWallet` 에
// 진짜 provider 가 올라오고 connect.js 의 pickProvider() 가 그걸 집는다.

const hex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
  (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * 시연용 계정을 만든다.
 *
 * @param {'embedded'|'wallet'} how  어떤 방법으로 들어온 척할 것인가
 */
export function createDemoAccount(how = 'embedded') {
  return Object.freeze({
    address: `0x${hex(20)}`,
    how,
    // 진짜가 아니라는 표식. 화면이 이걸 보고 경고를 띄운다.
    demo: true,
    createdAt: Math.floor(Date.now() / 1000),
  });
}

/** 수령 계정 등록도 가짜로 한다. 체인에 아무것도 안 올라간다 */
export function fakeRegisterRecipient(account) {
  return Object.freeze({
    recipient: account.address,
    txHash: `0x${hex(32)}`,
    demo: true,
  });
}

export const DEMO_NOTE = '시연용 계정입니다. 실제 지갑도 실제 체인 등록도 아닙니다.';
