import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { prepareRoot, requireValue } from './storage.mjs';
import { parseOptions } from './options.mjs';
process.umask(0o077);
try{
  requireValue(process.versions.node==='24.21.0','PINNED_NODE_REQUIRED');
  requireValue(process.platform==='darwin'&&process.arch==='arm64','MAC_ARM64_REQUIRED');
  const testRoot=process.env.CLEAR_TEST_ROOT;
  const args=process.argv.slice(2);
  parseOptions(args,testRoot);
  const root=await prepareRoot(testRoot,{synthetic:Boolean(testRoot)});
  const child=spawn('/usr/bin/lockf',['-s','-k','-t','0',join(root,'.lock'),process.execPath,fileURLToPath(new URL('./worker.mjs',import.meta.url)),...args],{detached:true,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,CLEAR_LOCKED:'1',LOG_LEVEL:'silent',...(testRoot?{CLEAR_TEST_ROOT:root}:{})},stdio:'inherit'});
  for(const signal of ['SIGINT','SIGTERM','SIGHUP']) process.once(signal,()=>{try{process.kill(-child.pid,signal);}catch{}});
  child.once('error',()=>{console.error('CLEAR: 실행 도구를 열 수 없습니다.');process.exitCode=1;});
  child.once('exit',(code)=>{
    if(code===75)console.error('CLEAR가 이미 실행 중입니다. 기존 실행을 먼저 마쳐 주세요.');
    process.exitCode=code??1;
  });
}catch(e){
  const messages={FILEVAULT_REQUIRED:'FileVault가 켜져 있어야 합니다.',BACKUP_EXCLUSION_REQUIRED:'전용 임시 폴더의 Time Machine 제외를 확인하지 못했습니다.',UNSAFE_PERMISSIONS:'전용 폴더 권한을 확인해 주세요.',MAC_ARM64_REQUIRED:'이번 작업본은 Apple Silicon Mac만 지원합니다.'};
  console.error('CLEAR: '+(messages[e.message]??'저장 경계 준비를 완료하지 못했습니다. 실행을 중단합니다.'));process.exitCode=1;
}
