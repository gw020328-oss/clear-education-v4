// Local, owner-selected mode. The only source is the pinned Moodle page.
// The write request grants one bounded job; its HTTP reservation is not a
// long-lived source lease. The job still rechecks the bound participant.
import {AsyncResource} from 'node:async_hooks';
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
import {readNormalView} from './normal-current-view.mjs';

const criterionId = 'activity-complete';

export function createNormalActivityReturn({store, mapping, origin, startedAt, now, signal,
  sourceWindows, commandScope, authorize, getBinding, key, observeFailure}) {
  const {courseId, targets: {activity}} = mapping;
  check(courseId === 2 && activity.module === 'page' && activity.cmId === 3,'BC_ACTIVITY_MAPPING');
  const owner = new AsyncResource('CLEAR_MOODLE_ACTIVITY_OWNER');
  const attempts = new Map();
  let pending = false;
  let lastStartedAt = -Infinity;

  function binding() {
    check(!signal.aborted && now() < startedAt + 1800,'BC_ACTIVITY_CLOSED');
    return getBinding();
  }

  return Object.freeze({
    pageId: activity.cmId,
    targets(context, applicationId) {
      const {app, user} = binding();
      if (!app || applicationId !== app || context.token !== user.token) return null;
      return {version:'clear-student-condition-targets.1', applicationId:app, moodleOrigin:origin,
        courseId, targets:[{criterionId, cmId:activity.cmId, module:'page', name:'지정 강의'}]};
    },
    queue(context, applicationId, body, requestKey) {
      exactKeys(body,['criterionId','expectedRevision'],'BC_ACTIVITY_BODY');
      check(body.criterionId === criterionId && Number.isSafeInteger(body.expectedRevision)
        && body.expectedRevision > 0 && typeof requestKey === 'string'
        && /^[a-z][a-z0-9.-]{0,79}$/.test(requestKey),'BC_ACTIVITY_BODY');
      const actor = authorize(context,true);
      const {app, user} = binding();
      check(actor.role === 'participant' && app === applicationId && context.token === user.token,'FORBIDDEN');
      const previous = attempts.get(requestKey);
      if (previous) {
        check(previous.expectedRevision === body.expectedRevision,'BC_IDEMPOTENCY_CONFLICT');
        commandScope.assert();
        commandScope.memoryCommitted();
        return previous.reply;
      }
      const view = readNormalView(() => store.getApplication(context,app));
      check(view.revision === body.expectedRevision && view.status === 'ACTIVE','BC_REVISION_CONFLICT');
      const time = now();
      if (pending || time - lastStartedAt < 5 || attempts.size >= 12) {
        commandScope.assert();
        commandScope.memoryCommitted();
        return {status:'RATE_LIMITED',retryAfterSeconds:5};
      }
      const operationId = key();
      const attempt = {expectedRevision:body.expectedRevision, reply:{status:'QUEUED',operationId}};
      commandScope.assert();
      commandScope.memoryCommitted();
      attempts.set(requestKey,attempt);
      pending = true;
      lastStartedAt = time;
      // Starting from the owner scope prevents another HTTP request from
      // changing the authority of the participant's asynchronous source probe.
      setImmediate(() => owner.runInAsyncScope(async () => {
        try {
          const current = binding();
          check(current.app === app && current.user.token === user.token,'FORBIDDEN');
          const deadline = Math.min(startedAt + 1800, now() + 900);
          if ((sourceWindows.get(criterionId) ?? 0) <= now()) sourceWindows.set(criterionId,deadline);
          const issued = store.issueBridgeRequest(user,app,{criterionId,expectedRevision:attempt.expectedRevision},key());
          await store.collectBridge(user,app,{requestId:issued.record.target.requestId,
            expectedRevision:issued.record.applicationRevision},key(),{signal,timeoutMs:30000});
          attempt.reply = {status:'RECORDED',operationId};
        } catch (error) {
          attempt.reply = {status:'UNAVAILABLE',operationId};
          try { observeFailure(error); } catch { /* Diagnostic persistence cannot retry the job. */ }
        } finally {
          pending = false;
        }
      }));
      return attempt.reply;
    },
  });
}
