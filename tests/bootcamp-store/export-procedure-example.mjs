import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
export async function procedureExample(){
 const cleanups=[],t={after:fn=>cleanups.push(fn)};
 try{
  const f=await procedureFixture(t),a=f.create();await f.complete(a);f.setFull(false);
  const registration=f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),bootstrap=f.store.inspectRegistrationForE4(f.operatorContext,a,registration.record.target.registrationTargetId);
  f.setFull(true);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
  const prepared=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,prepared.record.target.preparationId);
  const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});
  const publication=JSON.parse(db.prepare('SELECT record FROM e3_publications WHERE application_id=?').get(a).record);db.close();
  const student=f.view(a),operator=f.view(a,f.operatorContext);
  await f.refreshEvidence(a,START+480);f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key());f.publish(a);f.setTime(START+600);
  const op=f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key()),termination=f.store.inspectTerminationForE4(f.operatorContext,a,op.record.target.terminationIntentId);
  return {version:'clear-bootcamp-e3-synthetic-intake-example.1',execution:'SYNTHETIC_PORT_FIXTURE',actualSourceAcceptances:0,actualAllocations:0,authorizationSignatures:0,paymentTransactions:0,
   fictionalClock:true,bootstrap,consentScope:publication.consentScope,student,operator,target,termination};
 }finally{for(const fn of cleanups.reverse())await fn();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(JSON.stringify(await procedureExample(),null,2)+'\n');
