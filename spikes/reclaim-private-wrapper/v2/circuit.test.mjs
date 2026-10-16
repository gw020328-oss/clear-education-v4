import test from 'node:test';
import assert from 'node:assert/strict';
import {Noir} from '@noir-lang/noir_js';
import {parserProgram,parserWitness} from './parser-circuit.mjs';
import {rows,table} from './fixture.mjs';
import {parsePrivateTable} from './parser.mjs';

test('private bounded parser: actual ACVM constraints, not host-parser acceptance',async t=>{
 const program=await parserProgram(),noir=new Noir(program);
 const run=(html=table(),row=1,fields=rows[0])=>noir.execute(parserWitness(html,row,fields));
 for(const [name,html,row,fields] of [
  ['3 rows and Korean header',table(),1,rows[0]],
  ['10 digit second row',table(),2,rows[1]],
  ['8 digit third row',table(),3,rows[2]],
  ['no header and variable attributes',table(rows,{header:false,attrs:' id=x class="y"'}),0,rows[0]],
  ['hyphenated date',table([{...rows[0],date:'2026-10-10'}]),1,{...rows[0],date:'2026-10-10'}],
  ['input longer than previous 1024-byte capacity',table().replace('<tbody>','<!--'+'x'.repeat(500)+'--><tbody>'),1,rows[0]],
 ])await t.test(name,async()=>run(html,row,fields));
 const bad={
  'cross-row score substitution':()=>run(table(),1,{...rows[0],score:rows[2].score}),
  'cross-row registration substitution':()=>run(table(),1,{...rows[0],number:rows[1].number}),
  'header selected':()=>run(table(),0),
  'out of bounds row':()=>run(table(),4),
  'nested fact markup':()=>run(table().replace('Total 850','<span>Total 850</span>')),
  'entity fact':()=>run(table().replace('850 (','85&#48; (')),
  'redaction':()=>run(table().replace('850 (','8*0 (')),
  'invalid calendar':()=>run(table([{...rows[0],date:'2026.02.30'}]),1,{...rows[0],date:'2026.02.30'}),
  'invalid score step':()=>run(table([{...rows[0],score:'851'}]),1,{...rows[0],score:'851'}),
  'five digit number':()=>run(table([{...rows[0],number:'12345'}]),1,{...rows[0],number:'12345'}),
  'eleven digit number':()=>{const w=parserWitness(table([{...rows[0],number:'12345678901'}]),1,{...rows[0],number:'1234567890'});w.number_length=11;return noir.execute(w);},
  'too many physical rows':()=>run(table([rows[0]],{header:false}).replace('</tbody>','<tr><th>x</th></tr>'.repeat(16)+'</tbody>'),0),
  'too many cells':()=>run(table([rows[0]],{header:false}).replace('</tr>','<td>x</td>'.repeat(8)+'</tr>'),0),
  'length beyond capacity':()=>{const w=parserWitness();w.length=2049;return noir.execute(w);},
  'unbalanced table':()=>run(table().replace('</tbody>','')),
  'oversize cell':()=>run(table().replace('확인','x'.repeat(257))),
  'nonzero padding':()=>{const w=parserWitness();w.html[2047]=1;return noir.execute(w);},
  'invalid UTF-8 ancillary bytes':()=>{const w=parserWitness();w.html[Buffer.from(table()).indexOf(Buffer.from('확인'))]=255;return noir.execute(w);},
  'wrong private declared length':()=>{const w=parserWitness();w.length-=1;return noir.execute(w);},
 };
 for(const [name,fn] of Object.entries(bad))await t.test(name,async()=>assert.rejects(fn));
 // Preserved counterexamples to any claim that this component equals the
 // stricter reference parser. Neither is an integrated signed ZK statement.
 for(const [name,html] of [
  ['duplicate exam in another row',table([rows[0],rows[0]])],
  ['duplicate HTML attribute',table(rows,{attrs:' id=x id=y'})],
 ])await t.test('KNOWN GAP: '+name,async()=>{
  assert.throws(()=>parsePrivateTable(Buffer.from(html)));await run(html);
 });
});
