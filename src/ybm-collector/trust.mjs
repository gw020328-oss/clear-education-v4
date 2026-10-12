import {requireValue} from './values.mjs';
export const REGISTRY_URL='https://api.reclaimprotocol.org/api/attestors';
export function validateTrust(addresses){
  requireValue(Array.isArray(addresses)&&addresses.length>0&&addresses.length<=64,'ATTESTOR_TRUST');
  requireValue(addresses.every(v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v)),'ATTESTOR_TRUST');
  return [...new Set(addresses.map(v=>v.toLowerCase()))].sort();
}
// Public TLS-authenticated registry, frozen before login. Never learn trust from
// a claim's self-reported attestor address; never cache participant material.
export async function loadAttestorTrust({signal,fetcher=fetch}={}){
  try{
    const response=await fetcher(REGISTRY_URL,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean))});
    requireValue(response.status===200,'ATTESTOR_TRUST');
    let size=0;const chunks=[];
    for await(const chunk of response.body){size+=chunk.length;requireValue(size<=65536,'ATTESTOR_TRUST');chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return validateTrust(body.data?.map(w=>w.address));
  }catch{throw new Error('ATTESTOR_TRUST_UNAVAILABLE');}
}
