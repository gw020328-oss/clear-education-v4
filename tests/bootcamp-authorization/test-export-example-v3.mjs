import {writeFileSync} from 'node:fs';
import {fixtureV3} from './test-fixture-v3.mjs';
import {PROPOSAL} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {createTestDraftInspector} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
const write=(name,value)=>writeFileSync(new URL('../../docs/bootcamp-authorization/'+name,import.meta.url),JSON.stringify(value,null,2)+'\n');
write('test-encoding-proposal-v3.json',PROPOSAL);
const f=fixtureV3();
write('test-unsigned-example-v3.json',{provenance:'SYNTHETIC_EXAMPLE_NOT_AN_AUTHORIZATION',...f,result:createTestDraftInspector(f.snapshot,{clock:()=>f.now}).inspect(f.input,f.state)});
