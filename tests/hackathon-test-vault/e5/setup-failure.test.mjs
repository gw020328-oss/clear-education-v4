import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createEnvironment,environmentRecord,environmentStatus} from '../../../src/hackathon-test-vault/e5/environment.mjs';
test('setup failure stops only the new owned container, parks its bridge and preserves private evidence',async()=>{
 let id;await assert.rejects(()=>createEnvironment({testAfterStarted:info=>{id=info.environmentId;throw Error('E5_TEST_SETUP_CUT');}}),/E5_ENVIRONMENT_SETUP_FAILED/);
 const {dir,record}=environmentRecord(id);assert.equal(record.setupStatus,'FAILED');assert.equal(record.setupErrorCode,'E5_TEST_SETUP_CUT');assert.equal(record.cleanup.container,'STOPPED');assert.equal(record.cleanup.bridge,'REMOVED');assert.equal(record.cleanup.chainAndKeysPreserved,true);assert.equal(environmentStatus(id).running,false);assert.equal(record.networkParked,true);
 assert(existsSync(join(dir,'chain')));assert.equal(lstatSync(join(dir,'roles.json')).mode&0o777,0o600);assert(!existsSync(join(dir,'runtime.json')));
});
