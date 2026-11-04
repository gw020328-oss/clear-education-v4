// No application module may be evaluated as root, including configuration validation.
import {mkdirSync,chownSync,lstatSync} from 'node:fs';
import {verifyArtifact,check} from './artifact.mjs';

process.umask(0o077);
try {
  check(process.version==='v24.21.0','RUNTIME_VERSION');
  verifyArtifact(process.env.CLEAR_PREVIEW_ARTIFACT_HASH);
  check(process.env.RAILWAY_VOLUME_MOUNT_PATH==='/var/lib/clear-preview','PERSISTENT_VOLUME_REQUIRED');
  const state='/var/lib/clear-preview/state';
  if(process.getuid()===0) {
    check(lstatSync('/var/lib/clear-preview').isDirectory(),'STATE_DIRECTORY');
    mkdirSync(state,{recursive:true,mode:0o700});
    check(lstatSync(state).isDirectory(),'STATE_DIRECTORY');
    chownSync(state,1000,1000);
    process.setgroups([]);process.setgid(1000);process.setuid(1000);
  }
  check(process.getuid()===1000,'RUNTIME_UID');
  const {railwayConfiguration}=await import('./railway-config.mjs');
  const {startServer}=await import('./runtime.mjs');
  startServer({config:railwayConfiguration(process.env),secret:process.env.CLEAR_PREVIEW_HMAC_SECRET,
    host:'0.0.0.0',platform:'RAILWAY'});
} catch {console.error('PREVIEW_START_FAILED');process.exitCode=1;}
