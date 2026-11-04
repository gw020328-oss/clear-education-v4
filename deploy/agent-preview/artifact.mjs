// Trust anchor: ship this verifier and the tiny entrypoints in an immutable image.
// No application imports, npm modules, configuration validators or secret readers here.
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function check(ok,code) {if(!ok)throw Error(code);}
// SHA-256 of JSON.stringify(sorted canonical source paths). Changes require a reviewed
// bootstrap update; the manifest cannot select its own executable coverage.
const pathSetHash='c787a648fe46159f4d16843edf190ece8955fc9009b03524348b69e5b09317dc';
export function verifyPaths(paths) {
  check(new Set(paths).size===paths.length && digest(JSON.stringify([...paths].sort()))===pathSetHash,'ARTIFACT_FILE_SET');
}
function diskPaths(path) {
  const stat=lstatSync(resolve(root,path));
  check(!stat.isSymbolicLink(),'ARTIFACT_PATH');
  if(stat.isDirectory())return readdirSync(resolve(root,path)).filter(name=>name!=='tests')
    .flatMap(name=>diskPaths(path+'/'+name));
  check(stat.isFile(),'ARTIFACT_PATH');
  return path.endsWith('.test.mjs')?[]:[path];
}
export function verifyArtifact(expected,manifestPath=resolve(root,'build-manifest.json')) {
  const bytes=readFileSync(manifestPath);
  check(typeof expected==='string' && /^[a-f0-9]{64}$/.test(expected)
    && bytes.length<1048576 && digest(bytes)===expected,'ARTIFACT_MISMATCH');
  const manifest=JSON.parse(bytes);
  check(manifest.version==='clear-preview-build.1' && /^[a-f0-9]{40}$/.test(manifest.sourceHead)
    && Array.isArray(manifest.files),'ARTIFACT_MANIFEST');
  verifyPaths(manifest.files.map(entry=>entry.path));
  verifyPaths(['src','specs','packages/clear-core','deploy/agent-preview','package.json','package-lock.json'].flatMap(diskPaths));
  for(const {path,sha256} of manifest.files) {
    check(typeof path==='string' && !path.split('/').some(s=>s==='..'||s==='.'||s==='')
      && /^[a-f0-9]{64}$/.test(sha256),'ARTIFACT_PATH');
    check(lstatSync(resolve(root,path)).isFile() && digest(readFileSync(resolve(root,path)))===sha256,'ARTIFACT_MISMATCH');
  }
  return manifest.sourceHead;
}
