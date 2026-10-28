import {AsyncLocalStorage} from 'node:async_hooks';

// Context carries only a local deadline and a trusted synchronous observer.
// It never contains RPC arguments, encoded bytes, responses or identities.
const contexts=new AsyncLocalStorage();
export const withSendContext=(context,run)=>contexts.run(context,run);
export const currentSendContext=()=>contexts.getStore();
