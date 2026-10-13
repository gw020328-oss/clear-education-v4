// Fetch pinned official source into an ignored work directory and apply a small
// candidate integration patch. This never modifies installed collector modules.
import {mkdir,readFile,writeFile,symlink,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const commit='bc36dac3657fc46b79b4ecd545262c32440b05a6';
export const upstream=join(root,'.toolchain/attestor-extension-upstream');
export async function prepare(){
 await mkdir(upstream,{recursive:true});
 // Re-extract the pinned source each run; never trust a stale prepared cache.
 const r=await fetch(`https://api.github.com/repos/reclaimprotocol/attestor-core/tarball/${commit}`,{signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('UPSTREAM_DOWNLOAD');
 const archive=join(root,'.toolchain/attestor-extension-upstream.tar.gz');await writeFile(archive,Buffer.from(await r.arrayBuffer()));
 execFileSync('tar',['-xzf',archive,'--strip-components=1','-C',upstream]);
 try{await access(join(upstream,'node_modules'));}catch{await symlink(join(root,'src/ybm-collector/node_modules'),join(upstream,'node_modules'),'dir');}
 const path=join(upstream,'src/server/utils/assert-valid-claim-request.ts');
 let text=await readFile(path,'utf8');
 const beforeHash=createHash('sha256').update(text).digest('hex');
 if(beforeHash!=='f21cad75e025a499ad88ae31e7926ca3052286e62052ed5d4042b32ff70013d4')throw Error('UPSTREAM_CLAIM_SOURCE_HASH');
 const extensionUrl=new URL('attestor-extension.mjs',import.meta.url).href;
 const bridge="import { preflightExtension, PROVIDER } from "+JSON.stringify(extensionUrl)+"\nimport { completeExtension } from './clear-extension-bridge.mjs'\n";
 const before='\tconst receipt = await decryptTranscript(';
 const after='\tconst newData = await assertValidProviderTranscript(';
 if(text.split(before).length!==2||text.split(after).length!==2)throw Error('UPSTREAM_PATCH_CONTEXT');
 text=bridge+text.replace(before,'\tpreflightExtension(request)\n'+before).replace(after,"\tif(data.provider === PROVIDER) {\n\t\treturn completeExtension({ request, metadata, receipt, applData, data })\n\t}\n"+after);
 await writeFile(path,text);
 await writeFile(join(upstream,'src/server/utils/clear-extension-bridge.mjs'),"let handler;\nexport function installExtension(value){if(handler)throw Error('ALREADY_CONFIGURED');handler=value;}\nexport function completeExtension(input){if(!handler)throw Error('EXTENSION_NOT_CONFIGURED');return handler(input);}\n");
 // Test-only transport binding. Certificate verification and claim validation
 // are preserved. No public listening interface or production configuration.
 const server=join(upstream,'src/server/create-server.ts');
 const serverText=await readFile(server,'utf8');
 if(createHash('sha256').update(serverText).digest('hex')!=='c3820d7fed419d0bca9c71d95805bfed993e2d1ca7617db30827a1e663fad9c1')throw Error('UPSTREAM_SERVER_SOURCE_HASH');
 if(!serverText.includes('http.listen(port)'))throw Error('LISTEN_PATCH_CONTEXT');
 await writeFile(server,serverText.replace('http.listen(port)',"http.listen(port, '127.0.0.1')").replace('\treturn wss',"\t;(wss as any).localTestPort = (http.address() as any).port\n\treturn wss"));
 await writeFile(join(upstream,'clear-patch-provenance.json'),JSON.stringify({commit,beforeHash,afterHash:createHash('sha256').update(text).digest('hex'),testOnlyLoopback:true},null,2));
 return upstream;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await prepare();console.log('PINNED_UPSTREAM_EXTENSION_PREPARED');}
