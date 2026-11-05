// Local, owner-selected mode. Only the pinned Moodle page and assignment can be refreshed.
// The write request grants one bounded job; its HTTP reservation is not a
// long-lived source lease. The job retains its original Moodle intent fence.
import {AsyncResource} from 'node:async_hooks';
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
import {readNormalView} from './normal-current-view.mjs';

const allowed = ['activity-complete','assignment-submitted'];

export function createNormalActivityReturn({store, mapping, origin, startedAt, now, signal,
  sourceWindows, commandScope, authorize, getBinding, validateParticipant=()=>{}, key, observeFailure}) {
  const {courseId, targets: {activity,assignment,reflection}} = mapping;
  check(courseId === 2 && activity.module === 'page' && activity.cmId === 3,'BC_ACTIVITY_MAPPING');
  if(assignment)check(assignment.cmId===4&&assignment.instanceId===1,'BC_ACTIVITY_MAPPING');
  if(reflection)check(reflection.cmId===5&&reflection.forumId===3,'BC_ACTIVITY_MAPPING');
  const targets=[{criterionId:'activity-complete',cmId:3,module:'page',instanceId:activity.instanceId??1,name:'지정 강의'},
    ...(assignment?[{criterionId:'assignment-submitted',cmId:4,module:'assign',instanceId:1,name:'지정 과제'}]:[]),
    ...(reflection?[{criterionId:'reflection-topics',cmId:5,module:'forum',instanceId:3,name:'지정 회고'}]:[])];
  const owner = new AsyncResource('CLEAR_MOODLE_ACTIVITY_OWNER');
  const attempts = new Map();
  let pending = false;
  let lastStartedAt = -Infinity;

  function binding() {
    check(!signal.aborted && now() < startedAt + 1800,'BC_ACTIVITY_CLOSED');
    // This snapshot is also read inside SQLite transactions. Keep projection
    // reads out of it so source authority never reenters the store.
    return getBinding();
  }

  return Object.freeze({
    pageId: activity.cmId,
    targets(context, applicationId) {
      const {app, user} = binding();
      if (!app || applicationId !== app || context.token !== user.token) return null;
      return {version:'clear-student-condition-targets.1', applicationId:app, moodleOrigin:origin,
        courseId, targets:structuredClone(targets)};
    },
    queue(context, applicationId, body, requestKey) {
      exactKeys(body,['criterionId','expectedRevision'],'BC_ACTIVITY_BODY');
      const criterionId=body.criterionId;
      check(allowed.includes(criterionId)&&targets.some(t=>t.criterionId===criterionId) && Number.isSafeInteger(body.expectedRevision)
        && body.expectedRevision > 0 && typeof requestKey === 'string'
        && /^[a-z][a-z0-9.-]{0,79}$/.test(requestKey),'BC_ACTIVITY_BODY');
      const actor = authorize(context,true);
      const {app, user} = binding();
      check(actor.role === 'participant' && app === applicationId && context.token === user.token,'FORBIDDEN');
      validateParticipant();
      const previous = attempts.get(requestKey);
      if (previous) {
        check(previous.criterionId===criterionId&&previous.expectedRevision === body.expectedRevision,'BC_IDEMPOTENCY_CONFLICT');
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
      const attempt = {criterionId,expectedRevision:body.expectedRevision, reply:{status:'QUEUED',operationId}};
      const assertIntent = commandScope.captureActivityAuthority(app);
      commandScope.assert();
      commandScope.memoryCommitted();
      attempts.set(requestKey,attempt);
      pending = true;
      lastStartedAt = time;
      // Starting from the owner scope prevents another HTTP request from
      // changing the authority of the participant's asynchronous source probe.
      setImmediate(() => owner.runInAsyncScope(async () => {
        try {
          const assertAuthority = () => {
            assertIntent();
            const current = binding();
            check(current.app === app && current.user.token === user.token,'FORBIDDEN');
          };
          assertAuthority();
          validateParticipant();
          const deadline = Math.min(startedAt + 1800, now() + 900);
          if ((sourceWindows.get(criterionId) ?? 0) <= now()) sourceWindows.set(criterionId,deadline);
          assertAuthority();
          const issued = store.issueBridgeRequest(user,app,{criterionId,expectedRevision:attempt.expectedRevision},key());
          await store.collectBridge(user,app,{requestId:issued.record.target.requestId,
            expectedRevision:issued.record.applicationRevision},key(),{signal,timeoutMs:30000,assertAuthority});
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
