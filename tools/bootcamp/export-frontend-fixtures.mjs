// Two generated, public synthetic response examples. No actual source/chain/model execution.
import {procedureFixture} from '../../tests/bootcamp-store/procedure-fixture.mjs';
import {normalView,NORMAL_HOST_VERSION} from '../../src/bootcamp/normal-client.mjs';
import {p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
const cleanup=[],t={after:fn=>cleanup.push(fn)};let f;
try{
 f=await procedureFixture(t);const applicationId=f.create();
 const host={version:NORMAL_HOST_VERSION,sourceMode:'SYNTHETIC_TEST_SOURCE',policyHash:p0PolicyHash(P0_POLICY),
  procedureHttpVersion:'clear-bootcamp-review-procedure.1',operationsHttpVersion:'clear-bootcamp-operations-projection.2'};
 const read=context=>normalView({procedure:f.store.getProcedure(context,applicationId),operations:f.store.getOperationsProjection(context,applicationId),host});
 f.setFull(false);const missing={participant:read(f.aliceContext),operator:read(f.operatorContext)};
 await f.complete(applicationId);f.setFull(true);f.publish(applicationId);f.consent(applicationId);
 const waiting={participant:read(f.aliceContext),operator:read(f.operatorContext)};
 process.stdout.write(JSON.stringify({version:'clear-bootcamp-normal-frontend-fixtures.1',scope:'PUBLIC_SYNTHETIC_RESPONSE_EXAMPLES_NOT_RUNTIME_INPUT',
  scenarioClock:'OFFLINE_SYNTHETIC_2020_NOT_FRESH_SOURCE',realSourceVerified:false,chainTransactions:0,paidCalls:0,
  cases:{missing,waitingForOperatorConsent:waiting}},null,2)+'\n');
}finally{for(const fn of cleanup.reverse())await fn();}
