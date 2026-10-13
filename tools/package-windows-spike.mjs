// Build a source-only Windows synthetic diagnostic ZIP from committed files.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const paths=['spikes/windows-compatibility','src/ybm-collector/package.json','src/ybm-collector/package-lock.json','docs/spikes/PR21_REVIEW.ko.md'];
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
if(process.versions.node!=='24.21.0')throw Error('PINNED_NODE_REQUIRED');
if(git(['status','--porcelain','--',...paths]).trim())throw Error('COMMIT_PACKAGE_SOURCES_FIRST');
const commit=git(['rev-parse','HEAD']).trim();
const files=git(['ls-tree','-r','--name-only',commit,'--',...paths]).trim().split('\n');
if(!files.length||files.some(p=>/node_modules|\.toolchain|artifacts|\.log$/.test(p)))throw Error('SOURCE_MANIFEST');
const dest=join(root,'artifacts/windows-compatibility');await mkdir(dest,{recursive:true});
const name='CLEAR-Windows-Synthetic-Diagnostic.zip',temporary=join(dest,name+'.tmp');
try{
 git(['archive','--format=zip','--output='+temporary,commit,'--',...paths]);
 const sha256=createHash('sha256').update(await readFile(temporary)).digest('hex');
 await rename(temporary,join(dest,name));
 const manifest={schemaVersion:1,scope:'SYNTHETIC_SOURCE_PACKAGE',sourceCommit:commit,archive:name,sha256,files,containsRuntime:false,containsDependencies:false,bootstrapDownloadsPinnedPublicDependencies:true,liveCollection:false};
 await writeFile(join(dest,'package-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await writeFile(join(dest,name+'.sha256'),sha256+'  '+name+'\n');
 console.log(JSON.stringify(manifest,null,2));
}finally{await rm(temporary,{force:true});}
