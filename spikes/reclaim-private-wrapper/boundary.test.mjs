import test from 'node:test';
import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { build } from './build-circuit.mjs';
import { core, signedFixture, verifyFixture, witnessFor, requestFor, PARAMS, FIELDS, NOW,
  REGISTRATION, registrationDigest, contextFor, tableHtml, unsafePublicHash, unsafeSaltHash, requireSourceNullifier } from './model.mjs';

test('no CLEAR session: public registered record produces stock SDK request; caller fields are not facts',()=>{
  const r=requestFor();assert.equal(r.requiresClearSession,false);assert.equal(core.canonicalStringify(r.params),PARAMS);
  assert.deepEqual(r.context,{clearBinding:registrationDigest(REGISTRATION)});
  assert.equal('extractedParameters' in r.context,false);
});
test('stock Reclaim signature verifies; context canonicalization and parameter byte sensitivity',async()=>{
  const p=await signedFixture();assert.equal((await verifyFixture(p)).predicate,true);
  const reordered={...p.claim,context:JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(p.claim.context)).reverse()))};
  assert.equal(core.getIdentifierFromClaimInfo(reordered),p.claim.identifier);
  assert.notEqual(core.getIdentifierFromClaimInfo({...p.claim,parameters:JSON.stringify(JSON.parse(PARAMS),null,1)}),p.claim.identifier);
});
test('reissued signature and owner/context change defeat signature/claim-ID nullifiers',async()=>{
  const a=await signedFixture(),b=await signedFixture({timestampS:NOW-9});
  assert.notEqual(a.signature,b.signature);assert.equal(a.claim.identifier,b.claim.identifier);
  const r={...REGISTRATION,owner:'0x3333333333333333333333333333333333333333'};
  const c=await signedFixture({r});assert.notEqual(a.claim.identifier,c.claim.identifier);
  assert.equal(unsafePublicHash(FIELDS,r.reuseScope),unsafePublicHash(FIELDS,REGISTRATION.reuseScope));
  assert.notEqual(unsafeSaltHash(FIELDS,r.reuseScope,'A'),unsafeSaltHash(FIELDS,r.reuseScope,'B'));
});
test('public low entropy source hash is dictionary recoverable and cross-product scope is distinct',()=>{
  const hash=unsafePublicHash(FIELDS,REGISTRATION.reuseScope);let found;
  // Attacker knows prefix 123; only 1000 candidates. Does not need a proof/key.
  for(let n=123000;n<124000;n++)if(unsafePublicHash({...FIELDS,registration_number:String(n)},REGISTRATION.reuseScope)===hash){found=n;break;}
  assert.equal(found,123456);
  assert.notEqual(hash,unsafePublicHash(FIELDS,registrationDigest({...REGISTRATION,reuseScope:'OTHER_PRODUCT'})));
  assert.throws(requireSourceNullifier,/BLOCKED_NO_VERIFIED_STABLE/);
});

test('real circuit constraints: signed fields, binding, policy, dates, signatures and source mutation',async t=>{
  const program=await build({check:true}),noir=new Noir(program),p=await signedFixture(),w=witnessFor(p);
  await t.test('valid synthetic SDK claim executes constrained program',async()=>{await noir.execute(w);});
  const mutations={
    'unsigned score change':x=>x.score[0]=57,
    'unsigned different row identifier':x=>x.registration_number[5]=55,
    'unsigned date change':x=>x.exam_date[9]=49,
    'different registered binding':x=>x.binding[0]^=1,
    'different owner wallet':x=>x.owner[0]^=1,
    'stronger policy threshold':x=>x.threshold=900,
    'disjoint recognition period':x=>x.period_from=20261011,
    'expired proof':x=>x.now=NOW+1801,
    'future proof':x=>x.now=NOW-11,
    'corrupted attestor signature':x=>x.signature[0]^=1,
  };
  for(const [name,mutate] of Object.entries(mutations))await t.test(name,async()=>{
    const changed=structuredClone(w);mutate(changed);await assert.rejects(noir.execute(changed));
  });
  for(const [name,opts] of [
    ['signed invalid calendar',{fields:{...FIELDS,exam_date:'2026.02.30'}}],
    ['signed future exam date',{fields:{...FIELDS,exam_date:'2026.10.30'}}],
    ['signed below threshold',{fields:{...FIELDS,total_score:'700'}}],
    ['signed malformed score',{fields:{...FIELDS,total_score:'851'}}],
    ['signed other epoch',{epoch:2}],
    ['signed different endpoint',{params:PARAMS.replace('scoreList.php','other.php')}],
    ['signed partial-table reveal',{params:PARAMS.replace('//table[.//tr[@name=\\"TOE\\"]]','//tr')}],
    ['caller-context fake source facts',{context:core.canonicalStringify({clearBinding:registrationDigest(REGISTRATION),extractedParameters:{history_html:tableHtml()}})}],
  ])await t.test(name,async()=>{
    const bad=await signedFixture(opts);await assert.rejects(verifyFixture(bad));await assert.rejects(noir.execute(witnessFor(bad)));
  });
  await t.test('reissue accepted as predicate, NEVER treated as deduplicated claim',async()=>{
    const p2=await signedFixture({timestampS:NOW-9});await noir.execute(witnessFor(p2));assert.throws(requireSourceNullifier);
  });
  await t.test('another pre-registered wallet can prove the same source: source dedup remains blocked',async()=>{
    const r={...REGISTRATION,owner:'0x5555555555555555555555555555555555555555'};
    const again=await signedFixture({r});await noir.execute(witnessFor(again,r));
    assert.equal((await verifyFixture(again,r)).paymentAllowed,false);assert.throws(requireSourceNullifier);
  });
  await t.test('signed low first row + high second row cannot use second score with first identity',async()=>{
    const bad=await signedFixture({fields:{...FIELDS,total_score:'700'},second:{...FIELDS,registration_number:'654321',total_score:'950'}});
    const mixed=witnessFor(bad);mixed.score=Array.from(Buffer.from('950'));
    await assert.rejects(noir.execute(witnessFor(bad)));await assert.rejects(noir.execute(mixed));
  });
  await t.test('recipient/policy/source binding substitutions fail despite otherwise valid fixture',async()=>{
    for(const r of [{...REGISTRATION,recipient:'0x4444444444444444444444444444444444444444'},
      {...REGISTRATION,threshold:500},{...REGISTRATION,reuseScope:'OTHER_SCOPE'}]) {
      await assert.rejects(verifyFixture(p,r));await assert.rejects(noir.execute(witnessFor(p,r)));
    }
  });
});
