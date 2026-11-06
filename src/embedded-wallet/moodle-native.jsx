import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useWallets, useLoginWithOAuth} from '@privy-io/react-auth';
import {privyConfig, validateConfig} from './config.mjs';
import {createCourseWalletController} from './moodle-native-controller.mjs';
import {validateCourseWalletMountConfig} from './moodle-native-contract.mjs';
export {validateCourseWalletView, validateCourseWalletCommand} from './moodle-native-contract.mjs';
export {validateNativeWorkflowCommand} from './moodle-native-workflow.mjs';

function Runtime({config, target, onState, attach}) {
  const privy = usePrivy(), {wallets, ready: walletsReady} = useWallets(), {initOAuth} = useLoginWithOAuth();
  const controller = useRef(null), actions = useRef(null);
  actions.current = {login: () => initOAuth({provider: 'google'}), logout: () => privy.logout()};
  useEffect(() => {
    controller.current = createCourseWalletController({config, target, onState,
      sdk: {login: () => actions.current.login(), logout: () => actions.current.logout()}});
    attach(controller.current);
    return () => { void controller.current.destroy(); };
  }, []);
  useEffect(() => controller.current?.update({ready: privy.ready, authenticated: privy.authenticated,
    user: privy.user, wallets, walletsReady}), [privy.ready, privy.authenticated, privy.user, wallets, walletsReady]);
  // Moodle owns every workflow control. Only provider-owned approval modals
  // are rendered by PrivyProvider itself.
  return null;
}

export function mountCourseWallet({element, config, onState}) {
  config = validateCourseWalletMountConfig(config);
  const target = element?.ownerDocument?.defaultView, c = validateConfig(config);
  if (!target || target.location.origin !== c.origin || target !== target.top || c.surface !== 'MOODLE_NATIVE'
      || typeof onState !== 'function' || !['participant','operator'].includes(config.role)
      || !['/local/clearbridge/index.php','/local/clearbridge/configure.php'].includes(target.location.pathname)) {
    throw Error('MOODLE_WALLET_MOUNT');
  }
  const nonce = element.ownerDocument.querySelector('meta[name="sc-nonce"]')?.content;
  if (!/^[A-Za-z0-9+/]{32}$/.test(nonce ?? '')) throw Error('MOODLE_WALLET_NONCE');
  let controller, react, closed = false, container;
  if (config.role === 'operator') controller = createCourseWalletController({config, target, onState});
  else {
    container = element.ownerDocument.createElement('div');
    container.dataset.clearProvider = 'privy'; element.appendChild(container); react = createRoot(container);
    const providerConfig = privyConfig(c, nonce);
    react.render(<PrivyProvider appId={c.appId} config={providerConfig}>
      <Runtime config={config} target={target} onState={view => { if (!closed) onState(view); }} attach={value => {
        if (closed) void value.destroy(); else controller = value;
      }}/>
    </PrivyProvider>);
  }
  return Object.freeze({
    async dispatch(command) {
      if (closed || !controller) throw Error('MOODLE_WALLET_NOT_READY');
      await controller.dispatch(command);
    },
    async submitCommand(command) {
      if (closed || !controller) throw Error('MOODLE_WALLET_NOT_READY');
      return controller.submitCommand(command);
    },
    async runWorkflow(command) {
      if (closed || !controller) throw Error('MOODLE_WALLET_NOT_READY');
      return controller.runWorkflow(command);
    },
    async previewRequest(path, options) {
      if (closed || !controller) throw Error('MOODLE_WALLET_NOT_READY');
      return controller.previewRequest(path, options);
    },
    async destroy() {
      if (closed) return; closed = true;
      try { await controller?.destroy(); } finally { react?.unmount(); container?.remove(); }
    },
  });
}
