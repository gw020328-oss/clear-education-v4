// Test-process-only fault injection; never included in a distributed package.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
const mkdir=fs.mkdir.bind(fs),open=fs.open.bind(fs),writeFile=fs.writeFile.bind(fs);
const pause=()=>new Promise(r=>setTimeout(r,300));
const mode=process.env.CLEAR_FAULT;
const readdir=fs.readdir.bind(fs);
const rm=fs.rm.bind(fs),readFile=fs.readFile.bind(fs),kill=process.kill.bind(process);
const denied=syscall=>Object.assign(new Error('SYNTHETIC_PRIVATE_DETAIL_DO_NOT_LOG'),{
  code:'EPERM',syscall,path:process.env.CLEAR_TEST_ROOT,stack:'SYNTHETIC_PRIVATE_STACK_DO_NOT_LOG',
});
fs.rm=async function(path,...args){
  if(mode==='stale-delete-EPERM'&&String(path).startsWith(process.env.CLEAR_TEST_ROOT+'/session-'))throw denied('rmdir');
  return rm(path,...args);
};
fs.readFile=async function(path,...args){
  if(mode==='stale-browser-metadata-EPERM'&&String(path).endsWith('/browser.json'))throw denied('open');
  return readFile(path,...args);
};
process.kill=function(pid,signal){
  // Never signal a real target for this controlled inaccessible-owner probe.
  if(mode==='stale-owner-EPERM'&&pid===2147483647&&signal===0)throw denied('kill');
  return kill(pid,signal);
};
fs.readdir=async function(path,...args){
  if(path===process.env.CLEAR_TEST_ROOT && mode?.startsWith('recovery-')){
    const error=new Error('SYNTHETIC_PRIVATE_DETAIL_DO_NOT_LOG');
    error.code=mode.slice('recovery-'.length);
    error.syscall='scandir';error.path=path;
    throw error;
  }
  return readdir(path,...args);
};
fs.mkdir=async function(path,...args){
  const result=await mkdir(path,...args);
  if(String(path).endsWith('/profile')){
    if(mode==='init-error')throw new Error('SYNTHETIC_INIT_ERROR');
    if(mode==='init-signal'){process.kill(process.pid,'SIGTERM');await pause();}
  }
  return result;
};
fs.open=async function(path,...args){
  if(String(path).endsWith('/browser.json') && mode?.startsWith('browser-')){
    // The launch gate has spawned but no durable browser record exists yet.
    if(mode==='browser-signal')process.kill(process.pid,'SIGTERM');
    await pause();
    if(mode==='browser-error')throw new Error('SYNTHETIC_RECORD_ERROR');
  }
  return open(path,...args);
};
// Test output contains only a PID, not browser arguments or cookies.
const cp=await import('node:child_process');
const spawn=cp.default.spawn;
cp.default.spawn=function(...args){const child=spawn(...args);if(args[0].includes('Google Chrome') || args[1]?.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))writeFile(join(process.env.CLEAR_TEST_ROOT,'browser-pid'),String(child.pid));return child;};
(await import('node:module')).syncBuiltinESMExports();
