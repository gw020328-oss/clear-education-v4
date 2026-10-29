import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useWallets, useCreateWallet, useLoginWithOAuth} from '@privy-io/react-auth';
import {privyConfig, validateConfig} from './config.mjs';
import {walletChoices, selectedIdentity, connectSelectedWallet} from './privy-adapter.mjs';
import {bounded} from './provider-boundary.mjs';
import {createClearSession} from './clear-session.mjs';
import {createSameOriginApi} from '../application/api-client.mjs';

function Setup({config}) {
  return <section><h2>개발 앱 설정</h2><p>{config.phase === 'AUTH_LOCAL_TEST'
    ? '두 지갑의 CLEAR 로그인 서명과 서버 역할을 확인하는 로컬 시험입니다. 상품 신청·지급은 아직 활성화되지 않았습니다.'
    : '이 화면은 주소 확인 전용입니다. 신청·지급·CLEAR 운영자 권한은 아직 활성화되지 않았습니다.'}</p>
    <dl><dt>Allowed origin</dt><dd>{config.origin}</dd><dt>OAuth redirect</dt><dd>{config.redirectUri}</dd>
      <dt>로그인</dt><dd>Google · 개발용 공유 OAuth 설정</dd><dt>지갑</dt><dd>사용자 소유 Ethereum EOA · 스마트 지갑 및 위임 서명 끄기</dd></dl>
    <p>App ID만 공개 설정으로 사용합니다. 비밀번호·개인키·복구 문구·client secret을 이 화면이나 채팅에 입력하지 마세요.</p>
    {!config.appId && <p role="status">App ID가 없어 SDK 시작을 기다리고 있습니다.</p>}</section>;
}
function Onboarding({config}) {
  const privy = usePrivy(), {wallets, ready: walletsReady} = useWallets();
  const {createWallet} = useCreateWallet(), {initOAuth} = useLoginWithOAuth();
  const [selection, setSelection] = useState(null), [status, setStatus] = useState('주소 확인 준비'), [busy, setBusy] = useState(false);
  const [networkReady, setNetworkReady] = useState(false), [authState, setAuthState] = useState(null);
  const snapshot = useRef(null), active = useRef(null), operation = useRef(null), step = useRef('');
  const authSession = useRef(null);
  snapshot.current = {ready: privy.ready, authenticated: privy.authenticated, user: privy.user, walletsReady, wallets,
    externalWalletsDisabled: true}; // Fixed by privyConfig; never enabled by user input.
  const choices = walletChoices(privy.user, wallets);
  // SDK hooks cover silent user/wallet changes even if no EIP-1193 event fires.
  useEffect(() => {
    if (active.current) {
      try { selectedIdentity(snapshot.current, selection, config.chainId); }
      catch { cancel(); setStatus('계정 또는 네트워크 변경으로 이전 작업을 취소했습니다.'); }
    }
  });
  useEffect(() => () => {
    operation.current?.abort(); active.current?.dispose();
    void authSession.current?.dispose().catch(() => {});
  }, []);
  function cancel() {
    operation.current?.abort(); const boundary = active.current; active.current = null;
    boundary?.dispose(); setNetworkReady(false);
    void authSession.current?.invalidate().catch(() => {});
  }
  async function clearAuth() {
    const boundary = active.current, session = authSession.current;
    active.current = null; boundary?.dispose(); setNetworkReady(false);
    if (session) {
      // Keep the closed controller on failure so UNKNOWN cannot become a new login.
      await session.dispose();
    }
    if (authSession.current === session) { authSession.current = null; setAuthState(null); }
  }
  const run = async fn => {
    if (operation.current) return;
    setBusy(true); step.current = ''; const controller = new AbortController(); operation.current = controller;
    try { await bounded(() => fn(controller.signal), {signal: controller.signal, timeoutMs: 120000}); }
    catch { cancel(); setStatus(`${step.current ? step.current + ' 단계에서 ' : ''}작업을 완료하지 못했습니다. 다시 로그인하지 말고 표시된 단계를 알려주세요.`); }
    finally { setBusy(false); operation.current = null; }
  };
  const choose = async (c, signal) => { await clearAuth(); signal.throwIfAborted();
    setSelection({sdkUserId: c.sdkUserId, walletId: c.walletId, address: c.address}); setStatus('선택한 주소를 확인하고 네트워크 확인을 진행하세요.'); };
  async function probe(signal) {
    if (!selection) throw Error('SELECTION_REQUIRED');
    const c = walletChoices(snapshot.current.user, snapshot.current.wallets).find(v => v.walletId === selection.walletId && v.address === selection.address);
    if (!c) throw Error('SELECTION_CHANGED');
    await clearAuth();
    signal.throwIfAborted();
    step.current = '지갑 네트워크 전환';
    await bounded(() => c.wallet.switchChain(config.chainId), {signal});
    step.current = '선택한 지갑 연결 확인';
    let boundary;
    boundary = await connectSelectedWallet({readSnapshot: () => snapshot.current, selection, chainId: config.chainId, signal,
      timeoutMs: config.phase === 'AUTH_LOCAL_TEST' ? 120000 : 30000,
      onInvalidate: () => { if (active.current !== boundary) return;
        active.current = null; boundary.dispose(); operation.current?.abort(); setNetworkReady(false);
        void authSession.current?.invalidate().catch(() => {});
        setStatus('지갑 문맥이 변경되어 이전 작업을 취소했습니다.'); }});
    active.current = boundary;
    const rpc = async (method, params) => {
      const response = await fetch(config.rpcUrl, {method: 'POST', credentials: 'omit', signal,
        headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok) throw Error('RPC_UNAVAILABLE');
      const body = await response.json(); if (body.error) throw Error('RPC_FAILED'); return body.result;
    };
    step.current = '로컬 RPC 연결 확인';
    if (BigInt(await rpc('eth_chainId', [])) !== BigInt(config.chainId)) throw Error('RPC_CHAIN');
    if (await rpc('eth_getCode', [selection.address, 'latest']) !== '0x') throw Error('EOA_REQUIRED');
    await boundary.guard();
    if (signal.aborted) throw Error('CANCELLED');
    setNetworkReady(true);
    setStatus('선택한 EOA·SDK provider·로컬 RPC 체인을 확인했습니다. 실제 CLEAR 서명과 지급은 아직 미실행입니다.');
  }
  async function authenticate(signal) {
    if (config.phase !== 'AUTH_LOCAL_TEST' || !networkReady || !active.current || authSession.current) throw Error('AUTH_CHECK_NOT_READY');
    step.current = 'CLEAR 로그인 서명';
    const session = createClearSession({wallet: active.current, config,
      api: createSameOriginApi({origin: config.origin}), onState: setAuthState});
    authSession.current = session;
    const result = await session.authenticate();
    await session.assertSession();
    signal.throwIfAborted();
    setStatus(`CLEAR 로그인 서명 확인 완료 · 서버 역할: ${result.role === 'participant' ? '참가자' : '운영자'}`);
  }
  return <section><h2>Google 로그인과 주소 확인</h2>
    <p>참가자와 운영자는 서로 다른 Google 계정과 브라우저 프로필을 사용하세요. 역할은 두 주소를 서버에 등록한 뒤 서버가 정합니다.</p>
    {!privy.authenticated && <button disabled={!privy.ready || busy || !!authSession.current} onClick={() => run(() => initOAuth({provider: 'google'}))}>Google로 로그인</button>}
    {privy.authenticated && <>
      <p>재로그인 후 아래 주소가 이전과 같은지 직접 비교하세요. 다른 주소이면 기존 신청을 이어 진행하지 마세요.</p>
      {choices.length === 0 && privy.user?.linkedAccounts?.some(a => a.type === 'wallet' && ['privy','privy-v2'].includes(a.walletClientType)) &&
        <p role="status">기존 내장 지갑을 불러오는 중입니다. 이 탭을 열어 둔 채 잠시 기다려 주세요.</p>}
      {choices.map(c => <button key={c.walletId} disabled={busy} aria-pressed={selection?.walletId === c.walletId} onClick={() => run(signal => choose(c, signal))}>{c.address} 선택</button>)}
      {/* Creation needs an authenticated user, not external-connector readiness.
          SDK 3.51.0 skips connector initialization when external wallets are
          disabled, so useWallets.ready can remain false before the first wallet. */}
      {privy.ready && !privy.user?.linkedAccounts?.some(a => a.type === 'wallet' && ['privy','privy-v2'].includes(a.walletClientType)) &&
        <button disabled={busy} onClick={() => run(() => createWallet())}>첫 내장 지갑 만들기</button>}
      <p>현재 확인용 체인: {config.chainId}. 이 실행에서 새로 만든 격리 체인이며 기존 지급 기록과 별개입니다.</p>
      <button disabled={!selection || busy} onClick={() => run(probe)}>선택한 주소로 로컬 네트워크 확인</button>
      {config.phase === 'AUTH_LOCAL_TEST' && <>
        <p>아래 버튼은 서버가 발급한 로그인 확인 메시지(SIWE)에 서명합니다. 메시지의 주소와 로컬 사이트를 확인한 뒤 승인하세요. 상품 약관이나 지급 동의는 포함하지 않습니다.</p>
        <button disabled={!networkReady || busy || !!authSession.current} onClick={() => run(authenticate)}>CLEAR 로그인 서명 확인</button>
        {authState?.authenticated && <p role="status">서버에서 확인한 역할: {authState.role === 'participant' ? '참가자' : '운영자'}</p>}
      </>}
      <button disabled={busy} onClick={() => run(async () => { step.current = '로그아웃'; await clearAuth(); setSelection(null); await privy.logout(); setStatus('SDK 로그아웃 완료. 다시 로그인하여 같은 주소인지 확인하세요.'); })}>로그아웃</button>
    </>}
    {authState?.revocation === 'UNKNOWN' && <p role="alert">서버 로그아웃 결과가 불명확합니다. 새 로그인은 차단돼 있습니다. 표시된 상태를 알려주세요.</p>}
    {!!authSession.current && <button disabled={busy} onClick={() => run(async () => {
      step.current = 'CLEAR 세션 종료'; await clearAuth(); setStatus('CLEAR 서버 세션 종료 확인 완료. 주소와 네트워크를 다시 확인할 수 있습니다.');
    })}>CLEAR 세션 종료 확인</button>}
    {busy && <button onClick={cancel}>현재 작업 취소</button>}
    <p role="status">{status}</p><p>{config.phase === 'AUTH_LOCAL_TEST' ? '로그인 서명 확인만 제공하며, 거래 전송·ETH 충전·유료 호출은 실행하지 않습니다.' : '서명·거래 전송·ETH 충전·유료 호출 기능은 이 주소 확인 화면에 없습니다.'}</p>
  </section>;
}

const root = createRoot(document.getElementById('root'));
try {
  const response = await fetch('/__embedded/config', {credentials: 'same-origin', cache: 'no-store'});
  if (!response.ok) throw Error('CONFIG');
  const config = validateConfig(await response.json());
  if (config.origin !== location.origin || location.pathname !== '/onboarding' || !['ONBOARDING_ONLY','AUTH_LOCAL_TEST'].includes(config.phase)) throw Error('ORIGIN');
  const setup = <Setup config={config}/>;
  root.render(<main><h1>CLEAR 내장 지갑 연결 준비</h1>{setup}{config.appId &&
    <PrivyProvider appId={config.appId} config={privyConfig(config, document.querySelector('meta[name="sc-nonce"]').content)}>
      <Onboarding config={config}/></PrivyProvider>}</main>);
} catch { root.render(<main><h1>연결 설정을 확인할 수 없습니다</h1><p>호스트 설정 확인 후 다시 열어 주세요.</p></main>); }
