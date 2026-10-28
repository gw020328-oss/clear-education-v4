import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function fixedE3Factory(root){
 const folder=join(root,'fixed-e3-before-e5');mkdirSync(folder,{mode:0o700});
 for(const name of ['store','operations','r2-ledger','model','procedure','procedure-ledger','procedure-ports']){
  let code=execFileSync('git',['show',`c3b71c710f558529680e255222857f0e81fe1dcb:src/bootcamp/${name}.mjs`],{encoding:'utf8'});
  const original=new URL(`../../src/bootcamp/${name}.mjs`,import.meta.url);
  code=code.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>p.startsWith('./')?`from '${p}'`:`from '${new URL(p,original).href}'`)
   .replace("new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)",`new URL('${new URL('../../specs/bootcamp/p0-runtime-mapping.json',original).href}')`);
  writeFileSync(join(folder,name+'.mjs'),code,{mode:0o600});
 }return (await import(pathToFileURL(join(folder,'store.mjs')).href)).createBootcampStore;
}
