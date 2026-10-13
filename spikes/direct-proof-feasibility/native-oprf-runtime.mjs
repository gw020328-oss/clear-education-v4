// Optional isolated Mac native runtime. Public artifacts only; ephemeral keys.
import {createRequire} from 'node:module';
import {mkdtemp,cp,mkdir,symlink,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {finaliseSingleSharePinned} from './record-policy.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
export async function createNativeRuntime(){
 if(process.platform!=='darwin'||process.arch!=='arm64'||process.versions.node!=='24.21.0')throw Error('PINNED_MAC_ARM64_ONLY');
 const prior=JSON.parse(await readFile(new URL('oprf-native-report.json',import.meta.url),'utf8'));
 if(prior.artifactCommit!=='394f777fa404ef184652b6efc5aa60884dd55c7e')throw Error('ARTIFACT_COMMIT');
 const temp=await mkdtemp(join(tmpdir(),'clear-oprf-extension-'));
 try{
  const root=dirname(dirname(require.resolve('@reclaimprotocol/zk-symmetric-crypto')));
  if(JSON.parse(await readFile(join(root,'package.json'),'utf8')).version!=='5.1.6')throw Error('SDK_VERSION');
  await cp(join(root,'lib'),join(temp,'package/lib'),{recursive:true});
  await cp(join(root,'package.json'),join(temp,'package/package.json'));
  await symlink(fileURLToPath(new URL('../../src/ybm-collector/node_modules',import.meta.url)),join(temp,'node_modules'),'dir');
  for(const a of prior.artifacts){
   if(!/^(bin\/gnark\/darwin-arm64-lib(prove|verify)\.so|resources\/gnark\/(pk|r1cs)\.chacha20_oprf)$/.test(a.path))throw Error('ARTIFACT_PATH');
   const r=await fetch(`https://raw.githubusercontent.com/reclaimprotocol/zk-symmetric-crypto/${prior.artifactCommit}/${a.path}`,{signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw Error('DOWNLOAD');const bytes=Buffer.from(await r.arrayBuffer());
   if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('ARTIFACT_HASH');
   const path=join(temp,'package',a.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
  }
  const {makeGnarkOPRFOperator}=await import(pathToFileURL(join(temp,'package/lib/gnark/toprf.js')));
  const op=makeGnarkOPRFOperator({algorithm:'chacha20',fetcher:{fetch:async(engine,name)=>readFile(join(temp,'package/resources',engine,name))}});
  const keys=await op.generateThresholdKeys(2,1),keyFingerprint=createHash('sha256').update(keys.publicKey).digest('hex');
  return {keyFingerprint,async evaluateOprf(input,domain){
   const req=await op.generateOPRFRequestData(input,domain),response=await op.evaluateOPRF(keys.shares[0].privateKey,req.maskedData);
   const output=await finaliseSingleSharePinned(op,keys.publicKey,req,[{...response,publicKeyShare:keys.shares[0].publicKey}]);
   return {output,keyFingerprint};
  },close:()=>rm(temp,{recursive:true,force:true})};
 }catch(error){await rm(temp,{recursive:true,force:true});throw error;}
}
