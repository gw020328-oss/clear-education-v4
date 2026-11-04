import {createHash} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {check} from './config.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyArtifact(expected,manifestPath=resolve(root,'build-manifest.json')) {
  const bytes=readFileSync(manifestPath);
  check(bytes.length<1048576 && digest(bytes)===expected,'ARTIFACT_MISMATCH');
  const manifest=JSON.parse(bytes);
  check(manifest.version==='clear-preview-build.1' && /^[a-f0-9]{40}$/.test(manifest.sourceHead)
    && Array.isArray(manifest.files) && manifest.files.length>0,'ARTIFACT_MANIFEST');
  const paths=new Set();
  for(const {path,sha256} of manifest.files) {
    check(typeof path==='string' && !path.split('/').some(s=>s==='..'||s==='.'||s==='')
      && /^(src\/|specs\/|packages\/clear-core\/|deploy\/agent-preview\/|package(?:-lock)?\.json$)/.test(path)
      && !paths.has(path) && /^[a-f0-9]{64}$/.test(sha256),'ARTIFACT_PATH');
    paths.add(path);
    const file=resolve(root,path);
    check(lstatSync(file).isFile() && digest(readFileSync(file))===sha256,'ARTIFACT_MISMATCH');
  }
  for(const path of ['deploy/agent-preview/service.mjs','deploy/agent-preview/limits.mjs',
    'src/agent-preview/gemini-preparation.mjs','src/ai-policy/gemini-evaluation.mjs'])check(paths.has(path),'ARTIFACT_MANIFEST');
  return manifest.sourceHead;
}
