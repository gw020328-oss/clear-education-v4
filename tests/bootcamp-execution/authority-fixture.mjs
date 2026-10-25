import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {executionFixture,database,dump} from './fixture.mjs';
export const authorityTables=['e5_runtime_workers','e5_worker_fences','e5_worker_slots','e5_worker_stops','e5_worker_witnesses'];
export const authorityDump=f=>dump(f,authorityTables);
export async function authorityFixture(t){
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);
 const acquire=(extra={},context=f.context)=>f.store.execution.acquireRuntime(context,{owner:'worker-one',expectedFence:0,generation:1,leaseSeconds:30,...extra});
 return {...f,get store(){return f.store;},get time(){return f.time;},i,h,acquireRuntime:acquire};
}
export function corruptOwnedFixture(f,fn){database(f,db=>{
 db.exec('BEGIN IMMEDIATE');try{db.exec('UPDATE e5_worker_meta SET writer=1; UPDATE e5_meta SET writer=1');fn(db);db.exec('UPDATE e5_meta SET writer=0; UPDATE e5_worker_meta SET writer=0; COMMIT');}
 catch(error){db.exec('ROLLBACK');throw error;}
});}
export async function fixed97Factory(root){
 const folder=join(root,'fixed-97-before-global');mkdirSync(folder,{mode:0o700});
 for(const name of ['store','operations','r2-ledger','model','procedure','procedure-ledger','procedure-ports',
  'execution-ledger','execution-ports','execution-operations','execution-worker','execution-readback','execution-current','execution-e4-ports','execution-handshake']){
  let code=execFileSync('git',['show',`97f6413da80f8c9075baf344b5e2bf3f8c221360:src/bootcamp/${name}.mjs`],{encoding:'utf8'});
  const original=new URL(`../../src/bootcamp/${name}.mjs`,import.meta.url);
  code=code.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>p.startsWith('./')?`from '${p}'`:`from '${new URL(p,original).href}'`)
   .replace("from 'ethers'",`from '${import.meta.resolve('ethers')}'`)
   .replace("new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)",`new URL('${new URL('../../specs/bootcamp/p0-runtime-mapping.json',original).href}')`);
  writeFileSync(join(folder,name+'.mjs'),code,{mode:0o600});
 }
 return (await import(pathToFileURL(join(folder,'store.mjs')).href)).createBootcampStore;
}
