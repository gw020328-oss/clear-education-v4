// Same managed Mac boundary as the existing launcher; no session/browser is created here.
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRoot,requireValue} from '../../src/mac-collector/storage.mjs';
export async function launchNormalHostWorker({mode,name}){
 requireValue(['registry','run'].includes(mode)&&/^[a-z][a-z0-9-]{0,40}$/.test(name??''),'NORMAL_HOST_LAUNCH_ARGUMENT');
 requireValue(process.versions.node==='24.21.0'&&process.platform==='darwin'&&process.arch==='arm64'&&!process.env.CLEAR_TEST_ROOT,'NORMAL_HOST_PLATFORM');
 const root=await prepareRoot();
 const env={PATH:'/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',HOME:process.env.HOME,CLEAR_LOCKED:'1',LOG_LEVEL:'silent'};
 // The one existing native Developer key source only. Registry child receives no model key.
 if(mode==='run'&&typeof process.env.GEMINI_API_KEY==='string')env.GEMINI_API_KEY=process.env.GEMINI_API_KEY;
 const child=spawn('/bin/sh',['-c','ulimit -c 0 || exit 1; exec "$@"','clear-normal-host','/usr/bin/lockf','-s','-k','-t','0',join(root,'.lock'),process.execPath,
  fileURLToPath(new URL('./normal-host-worker.mjs',import.meta.url)),mode,name],{detached:true,env,stdio:'inherit'});
 const handlers=new Map();for(const s of ['SIGINT','SIGTERM','SIGHUP']){const fn=()=>{try{process.kill(-child.pid,s);}catch{}};handlers.set(s,fn);process.once(s,fn);}
 try{return await new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('NORMAL_HOST_WORKER_START')));child.once('exit',(code,signal)=>resolve({exitCode:code??1,signal:signal??null}));});}
 finally{for(const [s,fn]of handlers)process.removeListener(s,fn);}
}
