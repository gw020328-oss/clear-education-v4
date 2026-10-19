import {createEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=new URL('../../../.toolchain/hackathon-test-vault/e5/',import.meta.url);mkdirSync(out,{recursive:true});
try{const result=await createEnvironment();writeFileSync(new URL('host-created.json',out),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({environmentId:result.environmentId,chainId:result.manifest.chainId,endpoint:result.manifest.endpoint,manifestHash:result.manifestHash}));}
catch(e){console.error(e.message);process.exitCode=1;}
