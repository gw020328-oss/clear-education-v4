// Explicit stdout only: safe invented unsigned records, no key or signature.
import {PROPOSAL} from '../../src/bootcamp-authorization/schema.mjs';
import {createUnsignedDraftInspector} from '../../src/bootcamp-authorization/encoding.mjs';
import {fixture} from './fixture.mjs';
const f=fixture();
process.stdout.write(JSON.stringify(process.argv[2]==='proposal'?PROPOSAL:{provenance:'SYNTHETIC_EXAMPLE_NOT_AN_AUTHORIZATION',snapshot:f.snapshot,input:f.input,result:createUnsignedDraftInspector(f.snapshot).inspect(f.input)},null,2)+'\n');
