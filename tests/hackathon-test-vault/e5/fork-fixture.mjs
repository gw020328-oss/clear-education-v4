// New empty TEST chain only. IPC control is not exposed through execution ports/HTTP.
import {execFileSync} from 'node:child_process';
import {chmodSync} from 'node:fs';
import {join} from 'node:path';
import {environmentRecord,GETH_IMAGE,rewindOwnedTestChain} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ensure} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {hash} from './fixture.mjs';
export async function retainedOrphan(f){
 ensure((await f.vault.applicationIds()).length===0,'E5_FORK_EMPTY_ONLY');const {dir,record}=environmentRecord(f.id);
 const c=JSON.parse(execFileSync('docker',['inspect',record.container],{encoding:'utf8'}))[0];ensure(c.Config.Image===GETH_IMAGE&&c.Config.Labels['clear.e5.owner']===f.id,'E5_FORK_OWNER');
 const ipc=(method,params)=>{const request=JSON.stringify({jsonrpc:'2.0',method,params,id:1});const code=`JSON.stringify(web3.currentProvider.send(${request}))`;const output=execFileSync('docker',['exec',record.container,'geth','--datadir','/state','attach','--exec',code,'/state/geth.ipc'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});const result=JSON.parse(JSON.parse(output));ensure(!result.error&&Object.hasOwn(result,'result'),'E5_TEST_IPC_'+method.toUpperCase());return result.result;};
 const parent=await f.reader.block();
 const attrs=offset=>({timestamp:'0x'+(BigInt(parent.timestamp)+BigInt(offset)).toString(16),prevRandao:hash(),suggestedFeeRecipient:f.m.roles.depositor,withdrawals:[]});
 const a=ipc('testing_commitBlockV1',[attrs(1),[],'0x']);const height=Number(BigInt(parent.number)+1n);
 ensure(ipc('admin_exportChain',['/state/e5-empty-fork.rlp',height,height])===true,'E5_EMPTY_EXPORT');chmodSync(join(dir,'chain','e5-empty-fork.rlp'),0o600);
 await rewindOwnedTestChain(f.id,Number(BigInt(parent.number)));
 const b=ipc('testing_commitBlockV1',[attrs(2),[],'0x']);const observed=await f.reader.observe();ensure(observed.checkpoint.hash===b,'E5_FORK_OBSERVATION');await f.service.track(observed);
 ensure(ipc('admin_importChain',['/state/e5-empty-fork.rlp'])===true,'E5_EMPTY_IMPORT');
 ensure((await f.reader.block()).hash===a,'E5_IMPORT_CANONICAL');
 const orphan=await f.reader.rpc('eth_getBlockByHash',[b,false]);ensure(orphan?.hash===b,'E5_ORPHAN_RETAINED');return {orphan,replacement:await f.reader.block()};
}
