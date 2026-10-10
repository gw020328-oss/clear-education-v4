import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { readEvidence } from '../stage6/lib/files.mjs';
import { validateTrust } from '../stage6/lib/evidence.mjs';
import { centralClaim,onchainClaim,localProvider } from './lib/clients.mjs';
const [rail,url,file,manifestFile]=process.argv.slice(2);let provider;
try{
  const endpoint=new URL(url);if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw new Error('LOCAL_ONLY');
  const packet=await readEvidence(file);
  let result;if(rail==='central')result=await centralClaim(url,packet);
  else if(rail==='onchain'){const manifest=validateTrust(JSON.parse(await readFile(manifestFile,'utf8')));provider=localProvider(url);const signer=process.env.SUBMITTER_KEY?new Wallet(process.env.SUBMITTER_KEY,provider):await provider.getSigner(process.env.DEMO_SENDER);result=await onchainClaim(provider,manifest,packet,signer);}
  else throw new Error('USAGE');
  console.log(JSON.stringify(result));process.exitCode=result.success?0:2;
}catch(e){console.log(JSON.stringify({success:false,code:e.code||'CLI_CONFIGURATION'}));process.exitCode=2;}finally{provider?.destroy();}
