// Trusted bootstrap: only Node builtins and the immutable artifact verifier before verification.
import {readFileSync} from 'node:fs';
import {verifyArtifact,check} from './artifact.mjs';

process.umask(0o077);
try {
  check(process.version==='v24.21.0','RUNTIME_VERSION');
  const raw=JSON.parse(readFileSync(process.env.CLEAR_PREVIEW_CONFIG,'utf8'));
  verifyArtifact(raw.artifactHash,process.env.CLEAR_PREVIEW_BUILD_MANIFEST);
  const {validateConfig,readSecret}=await import('./config.mjs');
  const {startServer}=await import('./runtime.mjs');
  const config=validateConfig(raw),secret=readSecret(config.sharedSecretFile,/^[a-f0-9]{64}$/);
  startServer({config,secret,host:'127.0.0.1'});
} catch {console.error('PREVIEW_START_FAILED');process.exitCode=1;}
