import {ProductPanel} from './product-panel.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {validateConfig} from './config.mjs';
import {bounded} from './provider-boundary.mjs';
import {discoverMetaMask, requestMetaMaskAddress, connectMetaMask} from './metamask-adapter.mjs';
import {createClearSession} from './clear-session.mjs';
import {createSameOriginApi} from '../application/api-client.mjs';

function Operator({config}) {
  const [providers, setProviders] = useState([]), [candidate, setCandidate] = useState(null);
  const [selected, setSelected] = useState(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('MetaMask에서 사용할 운영자 계정 하나를 선택하세요.'), [authState, setAuthState] = useState(null);
  const selection = useRef(null), active = useRef(null), session = useRef(null), operation = useRef(null), step = useRef('');
  useEffect(() => discoverMetaMask(window, setProviders), []);
  useEffect(() => () => { cancel(); void session.current?.dispose().catch(() => {}); }, []);
  function cancel() {
    operation.current?.abort(); const boundary = active.current; active.current = null;
    boundary?.dispose(); setReady(false); void session.current?.invalidate().catch(() => {});
  }
  async function clear() {
    const boundary = active.current, old = session.current; active.current = null;
    boundary?.dispose(); setReady(false);
    if (old) await old.dispose(); // UNKNOWN retains the closed controller.
    if (session.current === old) { session.current = null; setAuthState(null); }
  }
  async function run(fn) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); step.current = '';
    try { await bounded(() => fn(controller.signal), {signal: controller.signal, timeoutMs: 120000}); }
    catch (error) { cancel(); setStatus(error?.message === 'METAMASK_ONE_ACCOUNT_REQUIRED'
      ? 'MetaMask의 이 사이트 연결 권한에서 운영자 계정 하나만 허용한 뒤 다시 연결하세요.'
      : `${step.current} 단계에서 완료하지 못했습니다. 표시된 단계와 상태를 알려주세요.`); }
    finally { operation.current = null; setBusy(false); }
  }
  async function connect(choice, signal) {
    step.current = 'MetaMask 주소 확인'; await clear(); signal.throwIfAborted();
    selection.current = null; setSelected(null); setCandidate(null);
    const address = await requestMetaMaskAddress(choice.provider, signal); signal.throwIfAborted();
    setCandidate({...choice, address}); setStatus('아래 전체 주소를 확인하고 직접 선택하세요. 서버 등록은 별도 확인 후 진행합니다.');
  }
  async function probe(signal) {
    step.current = 'MetaMask 로컬 네트워크'; await clear(); signal.throwIfAborted();
    const current = selection.current; if (!current) throw Error('SELECTION_REQUIRED');
    let boundary;
    boundary = await connectMetaMask({choice: current, address: current.address, readChoice: () => selection.current, config, signal,
      onInvalidate: () => { if (active.current !== boundary) return; cancel(); setStatus('MetaMask 계정 또는 체인이 바뀌어 이전 세션을 종료했습니다.'); }});
    active.current = boundary;
    step.current = '로컬 RPC 연결 확인';
    const rpc = async (method, params) => {
      const response = await fetch(config.rpcUrl, {method: 'POST', credentials: 'omit', signal,
        headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok) throw Error('RPC_UNAVAILABLE');
      const body = await response.json(); if (body.error) throw Error('RPC_FAILED'); return body.result;
    };
    if (BigInt(await rpc('eth_chainId', [])) !== BigInt(config.chainId)) throw Error('RPC_CHAIN');
    if (await rpc('eth_getCode', [current.address, 'latest']) !== '0x') throw Error('EOA_REQUIRED');
    await boundary.guard(signal); signal.throwIfAborted(); setReady(true);
    setStatus('선택한 MetaMask 주소·EOA·로컬 체인을 확인했습니다. 서버 등록 전에는 로그인할 수 없습니다.');
  }
  async function login(signal) {
    step.current = '운영자 CLEAR 로그인 서명';
    if (!ready || !active.current || session.current || !['AUTH_LOCAL_TEST','ACTIVE_LOCAL_TEST'].includes(config.phase)) throw Error('AUTH_NOT_READY');
    const auth = createClearSession({wallet: active.current, config, api: createSameOriginApi({origin: config.origin}), onState: setAuthState});
    session.current = auth;
    const result = await auth.authenticate(); await auth.assertSession(); signal.throwIfAborted();
    if (result.role !== 'operator') { await auth.dispose(); throw Error('OPERATOR_REQUIRED'); }
    setStatus('CLEAR 로그인 서명 확인 완료 · 서버 역할: 운영자');
  }
  return <main><h1>CLEAR 운영자 · MetaMask 연결</h1>
    <p>운영자는 MetaMask를 사용합니다. 참가자의 Google 내장 지갑 화면과 서로 다른 Chrome 프로필에서 진행하세요.</p>
    <section><h2>1. 운영자 주소 확인</h2>
      <p>MetaMask 확장 프로그램에서 사용할 계정을 직접 선택하세요. 이 사이트에는 계정 하나만 연결하세요. 과거 주소를 자동 선택하거나 운영자 권한을 자동 등록하지 않습니다.</p>
      {!providers.length && <p>MetaMask를 사용할 수 있는 Chrome 프로필에서 이 페이지를 열어 주세요.</p>}
      {providers.map((p, i) => <button key={p.id} disabled={busy} onClick={() => run(signal => connect(p, signal))}>MetaMask {providers.length > 1 ? i + 1 : ''} 연결하여 주소 확인</button>)}
      {candidate && <button disabled={busy} aria-pressed={selected?.address === candidate.address} onClick={() => run(async signal => {
        await clear(); signal.throwIfAborted(); selection.current = candidate; setSelected(candidate); setStatus('주소를 선택했습니다. 로컬 네트워크 확인을 진행하세요.');
      })}>{candidate.address} 선택</button>}
      <p>선택한 주소: {selected?.address ?? '아직 선택하지 않음'}</p>
    </section>
    <section><h2>2. 로컬 네트워크와 로그인 서명</h2>
      <p>체인 ID: {config.chainId} · RPC: {config.rpcUrl}. 이번 실행의 격리 시험 체인입니다.</p>
      <button disabled={!selected || busy} onClick={() => run(probe)}>MetaMask 로컬 네트워크 확인</button>
      <p>로그인 버튼은 CLEAR 로그인 메시지(SIWE)에만 서명합니다. MetaMask에서 로컬 사이트와 주소를 확인하세요. 상품 약관·지급 동의·거래 전송은 포함하지 않습니다.</p>
      {!['AUTH_LOCAL_TEST','ACTIVE_LOCAL_TEST'].includes(config.phase) && <p>이번 MetaMask 주소의 서버 등록을 기다리는 중입니다.</p>}
      <button disabled={!ready || busy || !!session.current || !['AUTH_LOCAL_TEST','ACTIVE_LOCAL_TEST'].includes(config.phase)} onClick={() => run(login)}>운영자 CLEAR 로그인 서명 확인</button>
      {authState?.authenticated && authState.role === 'operator' && <p>서버에서 확인한 역할: 운영자</p>}
      {!!session.current && <button disabled={busy} onClick={() => run(async () => { step.current = 'CLEAR 세션 종료'; await clear(); setStatus('CLEAR 세션 종료 확인 완료'); })}>CLEAR 세션 종료 확인</button>}
      {authState?.revocation === 'UNKNOWN' && <p role="alert">서버 세션 종료가 불명확합니다. 새 로그인은 차단됐습니다. 상태를 알려주세요.</p>}
      {busy && <button onClick={cancel}>현재 작업 취소</button>}
      {config.phase==='ACTIVE_LOCAL_TEST'&&authState?.authenticated&&active.current&&session.current&&<ProductPanel config={config} wallet={active.current} session={session.current}/>}
      <p role="status">{status}</p>
    </section></main>;
}
const root = createRoot(document.getElementById('root'));
try {
  const response = await fetch('/__embedded/config', {credentials: 'same-origin', cache: 'no-store'});
  if (!response.ok) throw Error('CONFIG');
  const config = validateConfig(await response.json());
  if (config.origin !== location.origin || location.pathname !== '/operator' || !['ONBOARDING_ONLY','AUTH_LOCAL_TEST','ACTIVE_LOCAL_TEST'].includes(config.phase)) throw Error('ORIGIN');
  root.render(<Operator config={config}/>);
} catch { root.render(<main><h1>운영자 연결 설정을 확인할 수 없습니다</h1><p>호스트 설정 확인 후 다시 열어 주세요.</p></main>); }
