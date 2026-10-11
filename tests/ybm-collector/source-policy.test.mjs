import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSource,joinSources,policyFor,sourcePolicyHash,sourceBundle,MAX_HTML_BYTES} from '../../src/ybm-collector/source-policy.mjs';
import {examFields,digest} from '../../src/ybm-collector/values.mjs';
import {registrationHtml,scoreHtml} from './source-fixture.mjs';
const read=(role,html)=>extractSource(role,Buffer.from(html));
test('minimal DOM extraction joins the selected exam rather than the first score row',()=>{
 const reg=read('registration',registrationHtml()),scores=read('score',scoreHtml([{number:'999999',score:'990'},{}]));
 const pair=joinSources(reg,scores);assert.equal(pair.score.index,1);assert.equal(pair.score.fields.total_score,'850');assert.equal(pair.highestScoreAssessed,false);
 assert.deepEqual(Object.keys(pair.registration.fields).sort(),['exam_date','exam_type','registration_number']);
 assert.equal(pair.score.fields.exam_date,'2026-09-20');
});
for(const [name,role,html] of [
 ['wrong exam','registration',registrationHtml().replace('class="TOEIC"','class="OTHER"')],
 ['invalid date','registration',registrationHtml('2026.02.30')],
 ['duplicate header','registration',registrationHtml().replace('</table>','<tr><th>수험번호</th><td>123456</td></tr></table>')],
 ['fake comment row','registration','<!--'+registrationHtml()+'-->'+registrationHtml()],
 ['invalid score','score',scoreHtml([{score:'991'}])],
 ['score step','score',scoreHtml([{score:'801'}])],
 ['duplicate exam','score',scoreHtml([{},{}])],
 ['unknown row layout','score',scoreHtml().replace('class="trSB"','class="changed"')],
 ['too many rows','score',scoreHtml(Array.from({length:17},(_,i)=>({number:String(123456+i)})))],
 ['empty score list','score',scoreHtml([])],
])test('rejects '+name,()=>assert.throws(()=>read(role,html)));
test('UTF-8, body size, allowed roles and fixed policy indexes are enforced',()=>{
 assert.throws(()=>extractSource('score',Buffer.from([0xff])));assert.throws(()=>extractSource('score',Buffer.alloc(MAX_HTML_BYTES+1)));assert.throws(()=>read('login',registrationHtml()));
 for(const args of [['score',16],['registration',1],['score',-1],['score',1.5],['cookie',0]])assert.throws(()=>policyFor(...args));
 assert.throws(()=>examFields({...read('score',scoreHtml())[0].fields,name:'extra'},'score'));
 assert.throws(()=>joinSources(read('registration',registrationHtml()),read('score',scoreHtml([{number:'999999'}]))));
});
test('all fixed selection recipes are pinned before collection and returned by copy',()=>{
 const p=policyFor('score',0);p.url='https://example.invalid';assert.notEqual(policyFor('score',0).url,p.url);
 assert.equal(digest(sourceBundle()),sourcePolicyHash);assert.notDeepEqual(policyFor('score',0),policyFor('score',1));
});

test('unexpected attributes in revealed markup fail closed rather than exposing values',()=>{
 assert.throws(()=>read('registration',registrationHtml().replace('<html class="TOEIC">','<html class="TOEIC" data-name="SYNTHETIC_PRIVATE">')));
 assert.throws(()=>read('registration',registrationHtml().replace('<div>','<div data-name="SYNTHETIC_PRIVATE">')));
 assert.throws(()=>read('score',scoreHtml().replace('<td>','<td data-name="SYNTHETIC_PRIVATE">')));
});
