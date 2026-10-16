import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {sandboxProfile,minimalEnv} from './native.mjs';
test('actual OS sandbox denies network and outside writes, allows run outputs',{skip:process.platform!=='darwin'},async()=>{
 const root=await realpath(await mkdtemp(tmpdir()+'/clear-native-boundary-'));
 const work=root+'/run';await mkdir(work);
 const script=`
  const fs=require('node:fs'),net=require('node:net');
  fs.writeFileSync(process.argv[1]+'/allowed','public synthetic');
  try{fs.writeFileSync(process.argv[2]+'/denied','public synthetic');process.exit(21);}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
  const s=net.createServer();s.once('error',e=>{if(!['EPERM','EACCES'].includes(e.code))process.exit(22);else process.stdout.write('OS_BOUNDARY_PASS');});
  s.listen(0,'127.0.0.1',()=>{s.close();process.exit(23);});`;
 try{
  const {stdout}=await promisify(execFile)('/usr/bin/sandbox-exec',['-p',sandboxProfile(work),process.execPath,'-e',script,work,root],{cwd:work,env:minimalEnv(),timeout:15000});
  assert.equal(stdout,'OS_BOUNDARY_PASS');await access(work+'/allowed');await assert.rejects(access(root+'/denied'));
 }finally{await rm(root,{recursive:true,force:true});}
});
