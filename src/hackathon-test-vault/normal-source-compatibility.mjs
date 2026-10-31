import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const NORMAL_SOURCE_INTAKE='specs/bootcamp/hackathon-test-normal-source-intake-v1.json';
export const NORMAL_SOURCE_INTAKE_SHA='410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9';
export const NORMAL_E2_PATH='src/bootcamp-authorization/test-encoding-v3.mjs';
const ensure=ok=>{if(!ok)throw Error('NORMAL_SOURCE_INTAKE_PIN');};
// Exact root-reviewed E2 label delta only. No source/authentication or paid-call
// authority follows from this compatibility record.
export function normalE2Hash(path,expected){
 if(path!==NORMAL_E2_PATH)return expected;
 const bytes=read(NORMAL_SOURCE_INTAKE);ensure(sha(bytes)===NORMAL_SOURCE_INTAKE_SHA);const record=JSON.parse(bytes);
 ensure(record.version==='clear-hackathon-test-normal-source-intake.1'&&record.status==='REVIEWED_THREE_NECESSARY_SOURCE_DELTAS_FOR_EXISTING_ISOLATED_TEST_SCOPE');
 for(const [p,hash]of Object.entries(record.immutableInputs))ensure(sha(read(p))===hash);
 const change=record.sourceChanges[NORMAL_E2_PATH];ensure(change.before===expected&&change.reviewedOwnerHead==='4d0f0b55614c3ad2e04b63d6946844eca391309b');
 ensure(record.invariants.registeredSourceClockInjectionAllowed===false&&record.invariants.provenanceLabelIsSourceAuthority===false&&record.invariants.defaultProductionActivation===false);
 const reviewPath='specs/bootcamp/hackathon-test-review-window-source-delta-v1.json';
 ensure(sha(read(reviewPath))==='a609096c8419e6a70862fe008653fc603b000ce80a8c4e1f9fef6022a13a1bdf');const delta=JSON.parse(read(reviewPath));
 const next=delta.changes[path];ensure(next.before===change.after&&delta.existingDeadlinesExtended===false&&delta.productionEnabled===false);
 ensure(sha(read(path))===next.after);return next.after;
}
