import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {prepareRoot,requireValue} from '../mac-collector/storage.mjs';
process.umask(0o077);
try{
 requireValue(process.argv.length===2&&!process.env.CLEAR_TEST_ROOT,'LAYOUT_NO_EXTERNAL_CONFIG');
 requireValue(process.versions.node==='24.21.0'&&process.platform==='darwin'&&process.arch==='arm64','LAYOUT_PLATFORM');
 const dependencyReader=createRequire(new URL('../ybm-collector/client.mjs',import.meta.url));
 try{for(const name of ['@reclaimprotocol/tls','@reclaimprotocol/tls/webcrypto','@reclaimprotocol/attestor-core'])dependencyReader.resolve(name);}
 catch{throw new Error('LAYOUT_DEPENDENCY_MISSING');}
 const root=await prepareRoot();
 const child=spawn('/bin/sh',['-c','ulimit -c 0 || exit 1; exec "$@"','clear-hr-layout','/usr/bin/lockf','-s','-k','-t','0',join(root,'.lock'),process.execPath,fileURLToPath(new URL('./layout-worker.mjs',import.meta.url))],{detached:true,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,CLEAR_LOCKED:'1',LOG_LEVEL:'silent'},stdio:'inherit'});
 for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.once(name,()=>{try{process.kill(-child.pid,name);}catch{}});
 child.once('error',()=>{console.error('HACKERRANK_LAYOUT_LAUNCH_FAILED');process.exitCode=1;});
 child.once('exit',code=>{if(code===75)console.error('CLEAR 실행이 이미 열려 있습니다. 기존 실행을 먼저 마쳐 주세요.');process.exitCode=code??1;});
}catch(error){console.error(error?.message==='LAYOUT_DEPENDENCY_MISSING'?'HACKERRANK_LAYOUT_DEPENDENCY_MISSING: 고정 ybm-collector 의존성을 먼저 설치하세요.':'HACKERRANK_LAYOUT_PREFLIGHT_FAILED: 고정 Node·Mac·FileVault·전용 저장 폴더 조건을 확인하세요.');process.exitCode=1;}
