import { mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { privateDirectory, unlock } from '../src/dev/files.mjs';
import { initializeSourceDevelopment, startSourceDevelopment } from '../src/product-workflow/http-development.mjs';
process.umask(0o077);
const root=realpathSync(join(dirname(fileURLToPath(import.meta.url)),'..'));
let running;
try{
 const {values,positionals}=parseArgs({allowPositionals:true,options:{name:{type:'string'},port:{type:'string'},'chain-id':{type:'string'},operator:{type:'string'},participant:{type:'string'},profile:{type:'string'}}});
 const [command]=positionals;
 if(positionals.length!==1||!['init','start','unlock'].includes(command)||!/^[a-z][a-z0-9-]{0,31}$/.test(values.name??''))throw Error('MVP_DEV_ARGUMENT');
 for(const part of ['var','var/mvp-evaluations']){if(command==='init')mkdirSync(join(root,part),{recursive:true,mode:0o700});privateDirectory(join(root,part));}
 const directory=join(root,'var/mvp-evaluations',values.name);
 if(command==='init')console.log(JSON.stringify(initializeSourceDevelopment({directory,port:values.port===undefined?9443:Number(values.port),chainId:values['chain-id']===undefined?431701:Number(values['chain-id']),operator:values.operator,participant:values.participant,evaluationProfile:values.profile??'ybm'})));
 else{
  if(values.port!==undefined||values['chain-id']!==undefined||values.operator!==undefined||values.participant!==undefined||values.profile!==undefined)throw Error('MVP_DEV_ARGUMENT');
  if(command==='unlock')unlock(directory);
  else{running=await startSourceDevelopment({directory,webRoot:join(root,'web/dist')});console.log(JSON.stringify(running.config));
   let stopping=false;const stop=()=>{if(!stopping){stopping=true;running.close().catch(()=>{process.exitCode=1;});}};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }
 }
}catch(error){console.error('CLEAR evaluation development failed: '+(/^(MVP_DEV_[A-Z_]+|DEV_[A-Z_]+|ROLE_CONFIG|ADDRESS|EEXIST|EADDRINUSE)$/.test(error.message)?error.message:'MVP_DEV_FAILED'));process.exitCode=1;}
