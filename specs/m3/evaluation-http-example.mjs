// Host-only public synthetic fixtures. Never imports real receipts or C2 results.
import {readFileSync} from 'node:fs';
import {exampleDraft} from '../m1/examples.mjs';
import {evaluationExample} from '../m2/examples.mjs';
import {compileMvpPolicy} from '../../src/policy/mvp/compiler.mjs';
import {digest} from '../../src/policy/mvp/contract.mjs';
import {requireRule as check} from '../../src/policy/values.mjs';
export function evaluationHttpExample(profile='ybm') {
 check(['ybm','siwon'].includes(profile),'EVAL_CONFIGURATION_REQUIRED');
 const draft=exampleDraft(profile),pins=JSON.parse(readFileSync(new URL('./evaluation-http-pins.json',import.meta.url),'utf8'))[profile];
 const compiled=compileMvpPolicy(draft,{sources:pins.sources,capabilities:pins.capabilities});check(compiled.policyHash===pins.policyHash,'EVAL_CONFIGURATION_REQUIRED');
 const {input}=evaluationExample(profile,{compiled}),fixtures=[];
 for(const original of input.evidence){
  const req=draft.requirements.find(r=>r.requirementId===original.requirementId),base=structuredClone(original);
  base.collectedAt=req.kind==='LEARNING'?req.period.until:draft.deadlines.evidenceUntil-3610;
  const exam=input.context.examPins.find(p=>p.evidenceId===base.evidenceId)??null;
  const add=(suffix,e,examValue=exam)=>fixtures.push({fixtureId:req.requirementId+'-'+suffix,evidence:e,exam:structuredClone(examValue),provenance:'PUBLIC_SYNTHETIC_ASSERTION'});
  add('ready',base);
  const unknown=structuredClone(base);unknown.authenticity='UNKNOWN';unknown.semantics='UNKNOWN';add('unverified',unknown);
  const missing=structuredClone(base);missing.observations.forEach(o=>{o.status='MISSING';o.value=null;o.days=null;});add('missing',missing);
  if(req.kind==='EXAM'){
   const corrected=structuredClone(base);corrected.sourceRevision='source-revision.2';corrected.observations.forEach(o=>{o.value=profile==='siwon'?850:800;});corrected.payloadHash=digest('SYNTHETIC-CORRECTED-SCORE',profile);add('corrected',corrected);
   const other=structuredClone(exam);other.submissionRef.examCommitment=digest('SYNTHETIC-OTHER-EXAM',profile);add('other-exam',base,other);
  }
 }
 return {profile,compiled,fixtures,studentPolicies:[{policyId:'evaluation-'+profile,revision:1,draft,sources:pins.sources,capabilities:pins.capabilities}],
  scenarioStart:draft.deadlines.evidenceUntil-3600};
}
