import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,chmodSync,symlinkSync,linkSync,readFileSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {atomicPrivate,privateDirectory,readPrivate,sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {loopbackRpc} from '../../../src/hackathon-test-vault/e5/rpc.mjs';
test('private bytes are exclusive, durable, mode-restricted and canonical hashes ignore object ordering',t=>{
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'clear-e5-unit-'));t.after(()=>rmSync(dir,{recursive:true}));
 privateDirectory(dir);const p=join(dir,'secret.json');atomicPrivate(p,{fixture:'synthetic'},{exclusive:true});assert.equal(lstatSync(p).mode&0o777,0o600);
 assert.equal(JSON.parse(readPrivate(p)).fixture,'synthetic');assert.throws(()=>atomicPrivate(p,{}, {exclusive:true}),/E5_ALREADY_EXISTS/);assert.equal(sha({a:1,b:2}),sha({b:2,a:1}));
 chmodSync(p,0o644);assert.throws(()=>readPrivate(p),/E5_PRIVATE_FILE/);chmodSync(p,0o600);
 linkSync(p,join(dir,'hardlink'));assert.throws(()=>readPrivate(p),/E5_PRIVATE_FILE/);
 symlinkSync(p,join(dir,'symlink'));assert.throws(()=>readPrivate(join(dir,'symlink')),/E5_PRIVATE_FILE/);
 chmodSync(dir,0o755);assert.throws(()=>privateDirectory(dir),/E5_PRIVATE_DIRECTORY/);chmodSync(dir,0o700);
});
test('RPC rejects external endpoints, credentials and redirects; invalid response IDs fail closed',async t=>{
 for(const url of ['https://127.0.0.1/','http://example.invalid/','http://localhost/','http://127.0.0.1/path','http://user:pass@127.0.0.1/','http://127.0.0.1/?token=x'])assert.throws(()=>loopbackRpc(url),/E5_LOOPBACK_ONLY/);
 let mode='redirect',requests=0;const server=createServer((req,res)=>{requests++;if(mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1:1/'});res.end();}else{res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:999,result:'0x1'}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const rpc=loopbackRpc('http://127.0.0.1:'+server.address().port+'/');await assert.rejects(()=>rpc('eth_chainId'),/E5_RPC_TRANSPORT/);assert.equal(requests,1);mode='id';await assert.rejects(()=>rpc('eth_chainId'),/E5_RPC_ID/);
});
