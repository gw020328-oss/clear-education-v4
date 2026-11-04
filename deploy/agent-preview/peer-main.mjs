// Trusted bootstrap. Application imports occur only after artifact verification.
import {readFileSync} from 'node:fs';
import {verifyArtifact,check} from './artifact.mjs';
process.umask(0o077);
try {
  check(process.version==='v24.21.0','RUNTIME_VERSION');
  const path=process.env.CLEAR_PEER_RELEASE;
  const raw=JSON.parse(readFileSync(path,'utf8'));
  verifyArtifact(raw.config?.artifactHash);
  check(process.getuid()===1000,'RUNTIME_UID');
  const {startPeerRuntime}=await import('./peer-runtime.mjs');
  await startPeerRuntime(path);
} catch {console.error('PEER_START_FAILED');process.exitCode=1;}
