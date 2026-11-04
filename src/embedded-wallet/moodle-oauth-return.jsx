import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useLoginWithOAuth} from '@privy-io/react-auth';
import {privyConfig, validateConfig} from './config.mjs';

function Return({config}) {
  const {ready, authenticated} = usePrivy(), {state} = useLoginWithOAuth(), done = useRef(false);
  useEffect(() => {
    if (done.current || !ready) return;
    if (authenticated && state.status === 'done') {
      done.current = true;
      history.replaceState(null, '', '/local/clearbridge/wallet-return');
      // The course comes from the owner config, never an OAuth URL parameter.
      location.replace(config.origin + '/local/clearbridge/index.php?id=' + config.courseId);
    } else if (state.status === 'error') {
      done.current = true;
      history.replaceState(null, '', '/local/clearbridge/wallet-return');
    }
  }, [ready, authenticated, state.status]);
  return <p role="status">{state.status === 'error'
    ? 'Google 연결을 완료하지 못했습니다. Moodle 강좌 화면으로 돌아가 다시 시작하세요.'
    : 'Google 연결을 확인한 뒤 Moodle 강좌로 돌아갑니다.'}</p>;
}

// This entry is served only by A. No OAuth query reaches a PHP route.
const element = document.getElementById('clear-oauth-return');
const input = JSON.parse(document.getElementById('clear-oauth-config').textContent);
const config = {...validateConfig(input), courseId: input.courseId};
const nonce = document.querySelector('meta[name="sc-nonce"]')?.content;
if (config.surface !== 'MOODLE_NATIVE' || location.origin !== config.origin
    || location.pathname !== '/local/clearbridge/wallet-return' || window !== window.top
    || !Number.isSafeInteger(config.courseId) || config.courseId < 1 || !/^[A-Za-z0-9+/]{32}$/.test(nonce ?? '')) {
  throw Error('MOODLE_OAUTH_RETURN_CONFIG');
}
createRoot(element).render(<PrivyProvider appId={config.appId} config={privyConfig(config, nonce)}><Return config={config}/></PrivyProvider>);
