import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {openHistoryIntake} from '../../src/exam-evidence/intake.mjs';
import {hash} from '../../src/policy/values.mjs';
const [directory,sessionId,seq]=process.argv.slice(2);
if(seq==='crash'){
 const db=new DatabaseSync(join(directory,'history-intake.sqlite'));
 db.exec('BEGIN IMMEDIATE');
 db.prepare('INSERT INTO replays VALUES(?)').run('SYNTHETIC_UNCOMMITTED');
 process.kill(process.pid,'SIGKILL');
}
const store=openHistoryIntake({directory,instanceId:'synthetic-intake',mode:'SYNTHETIC',verifierProfile:'synthetic-test.1',verifierConfigDigest:hash({synthetic:true}),clock:()=>1791954000,
  verify:async(p,s)=>({contextDigest:s.contextDigest,collectedAt:s.createdAt,proofVerified:true,wholeHistoryTableClaim:true,independentProcess:true,claimIdentifier:hash(p)})});
try{await store.accept(sessionId,{seq});console.log('ACCEPTED');}
catch(e){if(e.message!=='INTAKE_REPLAY_CONFLICT')throw e;console.log('CONFLICT');}
finally{store.close();}
