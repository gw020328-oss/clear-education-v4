// Public, immutable description. Keys and a server capability never cross HTTP.
import {check,keys,freeze,canonical,isAddress} from './values.mjs';
export const SELF_MODE='SELF_ATTESTOR_TEST';
export const SELF_HOSTS=Object.freeze(['www.hackerrank.com','hrcdn.net']);
export function validateSelfProfile(p){
 keys(p,['mode','profileId','endpoint','signer','sourceEnvironment','hosts','officialHostedSuccess','independentTrust','bgpCheckEnabled'],'SELF_PROFILE');
 check(p.mode===SELF_MODE&&/^self-[0-9a-f-]{36}$/.test(p.profileId)&&isAddress(p.signer),'SELF_PROFILE');
 let u;try{u=new URL(p.endpoint);}catch{};
 check(u&&u.protocol==='ws:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024&&Number(u.port)<=65535&&u.pathname==='/ws'&&!u.search&&!u.hash&&!u.username&&!u.password,'SELF_ENDPOINT');
 check(['LIVE_HACKERRANK','SYNTHETIC_HTTPS'].includes(p.sourceEnvironment)&&canonical(p.hosts)===canonical(SELF_HOSTS)
  &&p.officialHostedSuccess===false&&p.independentTrust===false&&p.bgpCheckEnabled===false,'SELF_PROFILE');return freeze(structuredClone(p));
}
export function requireProfileMode(p,mode='OFFICIAL',expected=null){
 check(['OFFICIAL',SELF_MODE].includes(mode),'ATTESTOR_MODE');
 if(mode==='OFFICIAL')check(p==null&&expected==null,'SELF_IN_OFFICIAL_PATH');
 else{validateSelfProfile(p);check(expected&&canonical(p)===canonical(validateSelfProfile(expected)),'SELF_PROFILE_CHANGED');}
}
