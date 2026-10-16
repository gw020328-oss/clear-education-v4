import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrivateTable,selectPrivateExam,LIMITS} from './parser.mjs';
import {rows,table} from './fixture.mjs';
const parse=s=>parsePrivateTable(Buffer.from(s));
test('private parser: 3 rows, header/body, variable attributes, 6..10 digits and ancillary markup',()=>{
 const result=parse(table());assert.equal(result.length,3);assert.equal(result[1].fields.registration_number.length,10);
 assert.equal(result[0].physicalIndex,1);assert.equal(result[0].fields.exam_date,'2026-10-10');
 for(const space of ['',' ','\r\n','\t'])assert.equal(parse(table(rows,{space,header:false,attrs:' id=score class=synthetic'})).length,3);
});
test('row/cell alignment rejects cross-row splice instead of finding matching numbers globally',()=>{
 const r=parse(table([{...rows[0],score:'700'},{...rows[1],score:'990'}]));
 assert.equal(r[0].fields.total_score,'700');assert.equal(r[1].fields.total_score,'990');
});
test('date separator normalizes; registration leading zeros stay distinct pending source semantics',()=>{
 const r=parse(table([{date:'2026-10-10',number:'00123456',score:'850'}]));assert.equal(r[0].fields.registration_number,'00123456');assert.equal(r[0].fields.exam_date,'2026-10-10');
});
const bad={
 'wrong source exam marker':()=>table().replace("name='TOE'","name='JPT'"),
 'missing source row name':()=>table().replace("name='TOE'",''),
 'missing source row class':()=>table().replace("class='trSB'",''),
 'duplicate source rows':()=>table([rows[0],rows[0]]),
 'same ID after date normalization':()=>table([rows[0],{...rows[0],date:'2026-10-10'}]),
 'ambiguous nested table':()=>table().replace('<td> TOEIC </td>','<td><table><tr><td>TOEIC</td></tr></table></td>'),
 'nested score':()=>table().replace('Total 850','<span>Total 850</span>'),
 'comment inside fact':()=>table().replace('123456</td>','123<!--x-->456</td>'),
 'fake row in comment is not a real row':()=>'<table><!--'+table()+'--></table>',
 'entities in fact':()=>table().replace('850 (','85&#48; ('),
 'unclosed cell':()=>table().replace(' TOEIC </td>',' TOEIC '),
 'mismatched cell end':()=>table().replace(' TOEIC </td>',' TOEIC </th>'),
 'redacted character':()=>table().replace('850','8*0'),
 'unsupported active markup':()=>table().replace('<tbody>','<script>123456</script><tbody>'),
 'duplicate attribute':()=>table(rows,{attrs:' id=x id=y'}),
 'unterminated attribute':()=>table(rows,{attrs:' id="x'}),
 'trailing second table':()=>table()+table(),
 'nested data tag':()=>table().replace(' TOEIC ','<b>TOEIC</b>'),
 'too many rows':()=>table(Array.from({length:17},(_,i)=>({...rows[0],number:String(100000+i)})),{header:false,extra:false}),
 'oversize':()=>table().replace('확인','x'.repeat(LIMITS.bytes)),
 'oversize cell':()=>table().replace('확인','x'.repeat(257)),
 'invalid calendar':()=>table([{...rows[0],date:'2026.02.30'}]),
 'invalid score unit':()=>table([{...rows[0],score:'851'}]),
 'score exceeds range':()=>table([{...rows[0],score:'995'}]),
 'registration too short':()=>table([{...rows[0],number:'12345'}]),
 'registration too long':()=>table([{...rows[0],number:'12345678901'}]),
 'mixed header data row':()=>table().replace('<th>시험</th>','<td>시험</td>'),
};
for(const [name,make] of Object.entries(bad))test(name,()=>assert.throws(()=>parse(make())));
test('index bounds and UTF-8 are checked without source values in errors',()=>{
 for(const i of [-1,3,0.5,NaN])assert.throws(()=>selectPrivateExam(Buffer.from(table()),i),/HTML_INDEX/);
 assert.throws(()=>parsePrivateTable(new Uint8Array([255])),/HTML_ENCODING/);
});
