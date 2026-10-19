// Explicit TEST child. Request/fixture metadata are new owned private files only.
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {readPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {openOwnedApiBridge} from '../../../src/hackathon-test-vault/e5b/bridge.mjs';
import {testApiController} from './controller-fixture.mjs';
const [id,cut]=process.argv.slice(2);let bridge,api;
try{
 const {dir}=environmentRecord(id),request=JSON.parse(readPrivate(join(dir,'b-crash-request.json'))),stored=JSON.parse(readPrivate(join(dir,'b-test-controller.json')));
 const state={...stored,now:()=>Math.floor(Date.now()/1000),seen:[],before:null};api=new DatabaseSync(join(dir,'test-api-controller.sqlite'));api.exec('PRAGMA synchronous=FULL');
 bridge=openOwnedApiBridge({environmentId:id,cut:phase=>{if(phase===cut)process.exit(86);}});bridge.owner.bindController(testApiController(api,state));await bridge.worker.dispatch(request);process.exitCode=0;
}catch{process.stderr.write('E5B_CHILD_REJECTED\n');process.exitCode=87;}finally{bridge?.owner.close();api?.close();}
