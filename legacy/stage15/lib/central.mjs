import {DatabaseSync} from 'node:sqlite';
import * as ethers from 'ethers';
import {runtimeConfig,domain,acceptanceTypes,receiptTypes,createRuntime} from '../shared/runtime.mjs';
const {hashConfig}=createRuntime(ethers);
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
// Valueless reference ledger with the same v3 consent and settlement rules.
// `actual` is server configuration, not data taken from the submitted signature.
export class CentralVault {
 constructor(plan,acceptance,actual={}) {
  this.plan=structuredClone(plan);this.config=actual.config??runtimeConfig(plan);this.domain=actual.domain??domain(plan);
  this.termsHash=actual.termsHash??plan.termsHash;this.learner=(actual.learner??plan.nativeTerms.recipient).toLowerCase();
  const time=actual.acceptedAt??plan.nativeTerms.enrolledAt,now=actual.now??plan.nativeTerms.enrolledAt;
  need(time>0&&time<=now&&time<=this.config.due&&now<=this.config.due,'CONSENT_TIME');
  need(acceptance.termsHash===this.termsHash&&acceptance.learner.toLowerCase()===this.learner&&acceptance.acceptedAt===time,'CONSENT_SCOPE');
  need(acceptance.runtimeConfigHash===hashConfig(this.config),'CONFIG_MISMATCH');
  const av={termsHash:acceptance.termsHash,runtimeConfigHash:acceptance.runtimeConfigHash,learner:acceptance.learner,acceptedAt:acceptance.acceptedAt};
  need(ethers.verifyTypedData(this.domain,acceptanceTypes,av,acceptance.signature).toLowerCase()===this.learner,'CONSENT');
  this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE ledger (id INTEGER PRIMARY KEY,reserve INTEGER NOT NULL CHECK(reserve>=0),settled INTEGER NOT NULL,paid INTEGER NOT NULL,returned INTEGER NOT NULL)');
  this.db.prepare('INSERT INTO ledger VALUES (1,?,0,0,0)').run(Number(this.config.amount));
 }
 status(){return this.db.prepare('SELECT * FROM ledger WHERE id=1').get();}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 claim(learner,items,now){const c=this.config;
  need(now<=c.claimUntil,'CLAIM_EXPIRED');need(learner.toLowerCase()===this.learner,'NOT_CLAIMABLE');need(items.length===c.requiredReceipts,'COUNT');
  const seen=new Set();for(const {receipt:r,signature} of items){
   need(r.termsHash===this.termsHash&&r.learner.toLowerCase()===this.learner&&Number.isInteger(r.session)&&r.session>=0&&r.session<c.requiredReceipts&&!seen.has(r.session),'SCOPE');seen.add(r.session);
   need(r.completedAt>=c.start&&r.completedAt<=c.due&&r.completedAt<=now,'RECEIPT_TIME');
   need(ethers.verifyTypedData(this.domain,receiptTypes,r,signature).toLowerCase()===c.verifier.toLowerCase(),'SIGNATURE');
  }
  return this.transaction(()=>{const r=this.status();need(!r.settled&&r.reserve>=Number(c.amount),'NOT_CLAIMABLE');this.db.prepare('UPDATE ledger SET reserve=0,settled=1,paid=? WHERE id=1').run(Number(c.amount));return this.status();});
 }
 reclaim(who,now){need(who.toLowerCase()===this.config.sponsor.toLowerCase()&&now>this.config.claimUntil,'NOT_EXPIRED');return this.transaction(()=>{need(!this.status().settled,'NOT_RECLAIMABLE');this.db.prepare('UPDATE ledger SET reserve=0,settled=1,returned=? WHERE id=1').run(Number(this.config.amount));return this.status();});}
 close(){this.db.close();}
}
