import {AsyncLocalStorage} from 'node:async_hooks';
import {requireRule as check} from '../policy/values.mjs';

// One request owns one existing intent grant. This scope is neither a grant
// registry nor authority: the intent's synchronous fence remains authoritative.
export function createMoodleCommandScope({enabled, reserve}) {
  const requests = new AsyncLocalStorage();
  const sync = value => { check(!value || typeof value.then !== 'function','MOODLE_COMMAND_ASYNC_COMMIT'); return value; };
  return Object.freeze({
    async run(input, work) {
      if (!enabled() || input.command.method !== 'POST') return work();
      check(!requests.getStore(),'MOODLE_COMMAND_NESTED');
      const reservation = await reserve(input), state = {reservation,business:false};
      return requests.run(state,async()=>{
        try { reservation.assert(); const result = await work(); reservation.finish(); return result; }
        finally { reservation.fail(); }
      });
    },
    assertContext(context) { requests.getStore()?.reservation.assertContext(context); },
    assert() { requests.getStore()?.reservation.assert(); },
    business(work) {
      const state = requests.getStore(); if (!state) return work();
      check(!state.business,'MOODLE_COMMAND_NESTED'); state.reservation.assert(); state.business = true;
      try { return sync(work()); } finally { state.business = false; }
    },
    transactionHooks() {
      const state = requests.getStore(); if (!state) return undefined;
      const business = state.business, reservation = state.reservation;
      return {
        beforeCommit() { reservation.assert(); },
        afterCommit(result) {
          if (!business) return;
          if (result?.error) reservation.fail();
          else reservation.committed();
        },
      };
    },
    beforeFile() { requests.getStore()?.reservation.assert(); },
    afterFile() { requests.getStore()?.reservation.durable(); },
    filesCommitted() { const r = requests.getStore()?.reservation; if(r) { r.assert(); r.committed(); } },
  });
}
