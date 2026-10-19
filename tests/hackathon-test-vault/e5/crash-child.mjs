// Explicit TEST subprocess only. CLI contains environment ID/action/cut, never secret bytes.
import {join} from 'node:path';
import {environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {readPrivate,atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {OwnedExecutionService} from '../../../src/hackathon-test-vault/e5/envelope-service.mjs';
import {testController} from './controller-fixture.mjs';
const [environmentId,action,point,slot='default']=process.argv.slice(2),{dir}=environmentRecord(environmentId),request=JSON.parse(readPrivate(join(dir,(slot==='default'?'crash':slot==='a'?'race-a':slot==='b'?'race-b':(()=>{throw Error('E5_TEST_SLOT');})())+'-request.json'))),controller=testController(environmentId);
controller.state.fence=request.binding.workerFence;
if(action==='dispatch')controller.commit(request);
const service=new OwnedExecutionService({environmentId,controller,cut:phase=>{if(phase===point)process.exit(86);}});
try{const result=await service[action](request);atomicPrivate(join(dir,(slot==='default'?'crash':'race-'+slot)+'-result.json'),result);process.exitCode=0;}
catch{process.exitCode=87;}finally{service.close();}
