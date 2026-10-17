import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBridgeExample} from '../../specs/m3/review-bridge-example.mjs';
import {reviewSourceFixture} from '../../specs/m3/review-source-binding-fixture.mjs';
import {normalizeReviewBody,projectRestrictedReviewHtml} from '../../src/review-evidence/common/normalizer.mjs';
import {createReviewBridgeSession} from '../../src/review-evidence/common/bridge.mjs';
import {reviewQueryHash,createReviewAcquisition,moodleSourceRevision} from '../../src/review-evidence/common/contract.mjs';
function fixture(t){
 const f=reviewBridgeExample(),base=reviewSourceFixture(),state={context:f.context,registry:f.registry,rawAvailable:true,authorizationValid:true,
  rawExpiresAtMs:f.query.expiresAtMs,authorizationExpiresAtMs:f.query.expiresAtMs,currentQueryHash:reviewQueryHash(f.query)};
 let time=f.query.issuedAtMs;const session=createReviewBridgeSession({...f,compiled:base.input.compiled,rawExpiresAtMs:state.rawExpiresAtMs,
  authorizationExpiresAtMs:state.authorizationExpiresAtMs,sourceRunId:f.query.sourceRunId,sourceGeneration:1,attempt:1,resolveCurrent:()=>state,now:()=>time});
 state.currentQueryHash=reviewQueryHash(session.query);t.after(()=>session.close());
 return {...f,state,session,setTime:n=>time=n};
}
for(const [html,text] of [
 ['<p>Hello <strong>course</strong><br>practice &amp; notes</p>','Hello course\npractice & notes'],
 ['<div class="text_to_html"><p>A</p>\n<p>B&nbsp;&#x1f600;</p></div>','A\nB\u00a0😀'],
 ['<p>A</p><p></p><p>B</p>','A\n\nB'],['<p> e\u0301 \n</p>',' é \n'],['&lt;script&gt;data&lt;/script&gt;','<script>data</script>']
])test('restricted HTML semantic projection '+JSON.stringify(html),()=>assert.equal(projectRestrictedReviewHtml(html),text));
for(const html of ['<script>x</script>','<p hidden>x</p>','<span style="display:none">x</span>','<!--x--><p>x</p>','<a href="https://example.invalid">x</a>',
 '<img src=x>','<P>x</P>','<p>x','<p><div>x</div></p>','<p>x</p>extra','<div><p>x</p><b>y</b></div>','x &bogus;','&#0;','&#xD800;'])test('unsupported HTML fails closed '+JSON.stringify(html),()=>assert.throws(()=>projectRestrictedReviewHtml(html),/RB_(HTML_UNSUPPORTED|SOURCE_TEXT)/));
test('HTML bounds and unsupported formats remain blocked',()=>{
 assert.throws(()=>projectRestrictedReviewHtml('<span>'.repeat(33)+'x'+'</span>'.repeat(33)),/RB_HTML_LIMIT/);
 assert.throws(()=>projectRestrictedReviewHtml('<br>'.repeat(2049)),/RB_HTML_LIMIT/);
 for(const format of [0,4])assert.throws(()=>normalizeReviewBody('x',format),/RB_NORMALIZATION_UNSUPPORTED/);
});
test('HTML adapter matches frozen vector and preserves original C2 sources with independent facts receipt',t=>{
 const f=fixture(t);f.setTime(f.nowMs);const out=f.session.correlate(f);
 assert.deepEqual(out.projection,f.projection);assert.deepEqual(out.sources,f.sources);assert.equal(out.projection.usableForAcceptance,false);
 assert.equal(out.projection.sourceStatus,'OBSERVED_TARGET');assert.ok(!JSON.stringify(out.projection).includes(out.sources[1].text));
});
test('query generation, authorization and raw lease changes abort and cannot revive the session',t=>{
 for(const kind of ['query','authorization','raw']){
  const f=fixture(t);f.setTime(f.nowMs);
  if(kind==='query')f.state.currentQueryHash='0x'+'1'.repeat(64);if(kind==='authorization')f.state.authorizationValid=false;if(kind==='raw')f.state.rawAvailable=false;
  assert.throws(()=>f.session.correlate(f),/RB_(STALE_QUERY|ACCESS)/);assert.equal(f.session.signal.aborted,true);
  f.state.currentQueryHash=reviewQueryHash(f.session.query);f.state.authorizationValid=true;f.state.rawAvailable=true;
  assert.throws(()=>f.session.correlate(f),/RB_CLOSED/);
 }
});
test('observed edit, registry normalizer mismatch and expired input never produce matching projections',t=>{
 const f=fixture(t);f.setTime(f.nowMs);const facts=structuredClone(f.facts);facts.source.body='<p>changed</p>';facts.sourceRevision=moodleSourceRevision(facts.source);
 const acquisition=createReviewAcquisition({facts,query:f.session.query,observedReaderId:6});assert.throws(()=>f.session.correlate({facts,acquisition}),/RB_CONTENT_MISMATCH/);
 assert.equal(f.session.signal.aborted,true);assert.throws(()=>f.session.correlate(f),/RB_CLOSED/);
 const expired=fixture(t);expired.setTime(expired.session.query.expiresAtMs);assert.throws(()=>expired.session.correlate(expired),/RB_QUERY_EXPIRED/);assert.equal(expired.session.signal.aborted,true);
});
test('unavailable source never reuses a prior receipt or changes original content sources',t=>{
 const f=fixture(t);f.setTime(f.nowMs);f.session.correlate(f);const out=f.session.unavailable();
 assert.equal(out.projection.sourceStatus,'UNAVAILABLE');assert.equal(out.projection.sourceReceiptHash,null);assert.equal(out.projection.normalization,null);assert.deepEqual(out.sources,f.sources);
});

test('normalizer registry change is latched and query lease cannot extend the original raw lease',t=>{
 const f=fixture(t);f.state.registry=structuredClone(f.registry);f.state.registry.normalizer='clear-review-plain-nfc-lf.1';
 assert.throws(()=>f.session.correlate(f),/RB_STALE_CONTEXT/);assert.equal(f.session.signal.aborted,true);
 const g=fixture(t);g.state.rawExpiresAtMs=g.nowMs;g.setTime(g.nowMs);
 assert.throws(()=>g.session.correlate(g),/RB_QUERY_EXPIRED/);
});
test('wall timer revokes the owned raw handle without another request',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(t);assert.equal(f.session.signal.aborted,false);
 t.mock.timers.tick(f.session.query.expiresAtMs-f.session.query.issuedAtMs);assert.equal(f.session.signal.aborted,true);
 assert.throws(()=>f.session.correlate(f),/RB_CLOSED/);
});
