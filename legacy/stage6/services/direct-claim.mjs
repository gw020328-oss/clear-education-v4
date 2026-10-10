import { readFile } from 'node:fs/promises';
import { JsonRpcProvider,Wallet } from 'ethers';
import { validateTrust,parseEvidenceText } from '../lib/evidence.mjs';
import { claimRefund } from '../lib/chain.mjs';

const provider=new JsonRpcProvider(process.env.CHAIN_URL,undefined,{cacheTimeout:-1});
try{
  const trusted=validateTrust(JSON.parse(await readFile(process.env.MANIFEST_PATH,'utf8'))),evidence=parseEvidenceText(await readFile(process.env.EVIDENCE_PATH,'utf8'));
  const signer=new Wallet(process.env.SUBMITTER_KEY,provider),result=await claimRefund(provider,trusted,signer,evidence);
  process.send?.({type:'complete',result});
}catch(error){process.send?.({type:'failed',code:error.code||error.message||'DIRECT_CLAIM_FAILED'});process.exitCode=1}
finally{provider.destroy();process.disconnect?.();}
