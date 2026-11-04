import {execFileSync} from 'node:child_process';
import {mkdirSync,lstatSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Only tracked source paths enter the build context; never archive the workspace.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(process.argv[2]??'var/preview-build');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
  .filter(p=>/^(src\/|specs\/|packages\/clear-core\/|deploy\/agent-preview\/|package(?:-lock)?\.json$)/.test(p))
  .filter(p=>!p.includes('/tests/')&&!p.endsWith('.test.mjs'));
if(!files.includes('deploy/agent-preview/server.mjs')) throw Error('COMMIT_DEPLOYMENT_FILES_BEFORE_PACKAGING');
if(files.some(p=>/\.(?:pem|key|sqlite|log)$|(^|\/)\.env/.test(p))) throw Error('PACKAGE_PATH_REJECTED');
mkdirSync(out,{recursive:false,mode:0o700});
const manifest=[];
for(const path of files) {
  const source=resolve(root,path),target=resolve(out,path);
  if(relative(root,source).startsWith('..')||!lstatSync(source).isFile())throw Error('PACKAGE_FILE_REJECTED');
  mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
  manifest.push({path,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')});
}
writeFileSync(resolve(out,'build-manifest.json'),JSON.stringify({version:'clear-preview-build.1',
  sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:manifest},null,2)+'\n');
console.log(JSON.stringify({buildContext:out,files:files.length,containsPrivateConfiguration:false}));
