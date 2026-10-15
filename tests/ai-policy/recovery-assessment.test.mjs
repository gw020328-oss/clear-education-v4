import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRecovery} from './recovery-assessment.mjs';
test('correct normal values do not hide unnecessary questions or a global flag',()=>{
 const result={fields:[{fieldId:'score',value:'700',location:'L1'}],questions:[{questionId:'unnecessary',fieldIds:['score'],text:'Eligible?'}],flags:[{code:'INJECTION',fieldIds:null}]};
 assert.deepEqual(assessRecovery(result,{fields:{score:'700'}},{normal:true}).errors,['UNEXPECTED_QUESTION','UNEXPECTED_FLAG']);
});
test('a conflict flag does not excuse selecting one conflicting number',()=>{
 const result={fields:[{fieldId:'score',value:'700',location:'L1'}],questions:[{}],flags:[{code:'CONFLICT',fieldIds:['score']}]};
 assert.deepEqual(assessRecovery(result,{fields:{score:null},questionRequired:true}).errors,['VALUE:score']);
});
test('missing Vision field stays null while a visible unaffected subject remains observed',()=>{
 const result={fields:[{fieldId:'subject',value:'PERSON_A',location:'row 2'},{fieldId:'score',value:null,location:null}],questions:[{fieldIds:['score']}],flags:[]},gold={fields:{subject:'PERSON_A',score:null},questionRequired:true};
 assert.equal(assessRecovery(result,gold).status,'PASS');
 result.fields[0].value=null;assert.deepEqual(assessRecovery(result,gold).errors,['VALUE:subject']);
});
