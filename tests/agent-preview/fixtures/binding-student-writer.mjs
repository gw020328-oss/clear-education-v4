import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { createApplicationService } from '../../../src/application/service.mjs';
import { createStudentWorkflowService } from '../../../src/product-workflow/student-http-service.mjs';
import { studentHttpExamplePolicies } from '../../../specs/m3/student-http-example.mjs';

// Runs the actual student command's workflow→auth lock order in another process.
process.once('message', async ({ authConfig, directory, context, applicationId, body }) => {
  let auth, student, probe;
  try {
    auth = createApplicationService({ ...authConfig, now: () => 1000 });
    probe = new DatabaseSync(join(authConfig.directory, 'applications.sqlite'), { timeout: 0 });
    let checks = 0;
    const authentication = { origin: auth.origin, authorizeWorkflow(c, write) {
      if (++checks === 2) {
        process.send({ event: 'workflow-held' });
        // Observe the competing auth lock before entering the actual service check.
        const deadline = performance.now() + 3000;
        let blocked = false;
        while (performance.now() < deadline) {
          try { probe.prepare('SELECT config FROM metadata WHERE id=1').get(); }
          catch (error) { if (!/database is locked/.test(error.message)) throw error; blocked = true; break; }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
        if (!blocked) throw Error('AUTH_LOCK_NOT_OBSERVED');
        process.send({ event: 'auth-blocked' });
      }
      return auth.authorizeWorkflow(c, write);
    } };
    student = createStudentWorkflowService({ directory, authentication, instanceId: 'student-binding-test', policies: studentHttpExamplePolicies(), now: () => 1000 });
    student.acknowledge(context, applicationId, body, 'ack');
    process.send({ event: 'done', result: 'COMMITTED' });
  } catch (e) { process.send({ event: 'done', result: e.message }); }
  finally { probe?.close(); student?.close(); auth?.close(); process.disconnect(); }
});
