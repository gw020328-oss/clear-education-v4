import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { freeze,requireRule as check } from '../policy/values.mjs';
import { SOURCE_LIMITS } from './source-contract.mjs';
export const OFFICIAL_URLS=freeze([
 'https://toeic.ybmclass.com/toeic/refundclass/index_v5.asp',
 'https://lab.siwonschool.com/?s=event&t=refundhalf3',
 'https://customer.siwonschool.com/common/notice/901',
 'https://blog.naver.com/siwonschoollab/223244039814',
]);
export function validatePublicUrl(value,allowlist=OFFICIAL_URLS){
  let u;try{u=new URL(value);}catch{check(false,'SOURCE_URL_BLOCKED');}
  check(typeof value==='string'&&value.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash
    &&allowlist.includes(u.href),'SOURCE_URL_BLOCKED');return u;
}
export function isPublicAddress(address){
  const family=isIP(address);if(family===4){const n=address.split('.').reduce((v,x)=>(v*256+Number(x))>>>0,0);
    const ranges=[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
      ['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]];
    return !ranges.some(([ip,bits])=>{const base=ip.split('.').reduce((v,x)=>(v*256+Number(x))>>>0,0),mask=(0xffffffff<<(32-bits))>>>0;return (n&mask)===(base&mask);});
  }
  if(family===6){const parts=address.toLowerCase().split(':'),first=parseInt(parts[0],16),second=parseInt(parts[1]||'0',16);
    return first>=0x2000&&first<=0x3fff&&first!==0x2002&&first!==0x3fff&&!(first===0x2001&&(second<=0x1ff||second===0xdb8));}
  return false;
}
function bounded(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(Error('SOURCE_FETCH_CANCELLED'));};signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',abort);resolve(v);},()=>{signal.removeEventListener('abort',abort);reject(Error('SOURCE_FETCH_FAILED'));});if(signal.aborted)abort();});}
export function requestPinned(u,address,limit,signal){return new Promise((resolve,reject)=>{
  const req=httpsRequest({hostname:u.hostname,servername:u.hostname,port:443,path:u.pathname+u.search,method:'GET',agent:false,family:address.family,
    lookup:(_host,_options,callback)=>callback(null,address.address,address.family),signal,
    headers:{accept:'text/html,text/plain,image/png,image/jpeg','accept-encoding':'identity','user-agent':'CLEAR-Public-Source/1'}},res=>{
      const status=res.statusCode,location=res.headers.location;
      if([301,302,303,307,308].includes(status)){res.destroy();resolve({status,location,mediaType:null,bytes:Buffer.alloc(0)});return;}
      const encoding=res.headers['content-encoding'];if(encoding&&encoding!=='identity'){res.destroy();reject(Error('SOURCE_ENCODING'));return;}
      let length=0;const chunks=[];res.on('data',chunk=>{length+=chunk.length;if(length>limit){res.destroy();reject(Error('SOURCE_SIZE'));}else chunks.push(chunk);});
      res.on('end',()=>resolve({status,location:null,mediaType:String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase(),bytes:Buffer.concat(chunks)}));
      res.on('error',()=>reject(Error('SOURCE_FETCH_FAILED')));
    });req.on('error',()=>reject(Error('SOURCE_FETCH_FAILED')));req.end();
});}
// Trusted server configuration only. No user-supplied transport, headers,
// cookies, proxy, port, allowlist edits, scripts or automatic link discovery.
export async function fetchPublicResource(value,{kind='PAGE',allowlist=OFFICIAL_URLS,lookup=dnsLookup,request=requestPinned,signal}={}){
  check(['PAGE','IMAGE'].includes(kind),'SOURCE_MEDIA');const permitted=[...allowlist],start=validatePublicUrl(value,permitted).href;
  const active=AbortSignal.any([AbortSignal.timeout(SOURCE_LIMITS.requestTimeoutMs),...(signal?[signal]:[])]);
  const limit=kind==='PAGE'?SOURCE_LIMITS.maxBodyBytes:SOURCE_LIMITS.maxImageBytes;let next=start;
  for(let redirects=0;redirects<=SOURCE_LIMITS.maxRedirects;redirects++){
    check(!active.aborted,'SOURCE_FETCH_CANCELLED');const u=validatePublicUrl(next,permitted);
    const addresses=await bounded(lookup(u.hostname,{all:true,verbatim:true}),active);
    check(Array.isArray(addresses)&&addresses.length>0&&addresses.length<=64&&addresses.every(a=>isPublicAddress(a.address)&&isIP(a.address)===a.family),'SOURCE_DESTINATION_BLOCKED');
    const response=await bounded(request(u,addresses[0],limit,active),active);check(!active.aborted,'SOURCE_FETCH_CANCELLED');
    if([301,302,303,307,308].includes(response.status)){check(redirects<SOURCE_LIMITS.maxRedirects&&typeof response.location==='string','SOURCE_REDIRECT');
      next=validatePublicUrl(new URL(response.location,u).href,permitted).href;check(new URL(next).origin===new URL(start).origin,'SOURCE_REDIRECT_ORIGIN');continue;}
    if(response.status!==200){const error=Error('SOURCE_HTTP_STATUS');if(Number.isInteger(response.status)&&response.status>=100&&response.status<=599)error.httpStatus=response.status;throw error;}check(kind==='PAGE'?['text/html','text/plain'].includes(response.mediaType):['image/png','image/jpeg'].includes(response.mediaType),'SOURCE_MEDIA');
    check(response.bytes instanceof Uint8Array&&response.bytes.byteLength>0&&response.bytes.byteLength<=limit,'SOURCE_SIZE');
    if(kind==='IMAGE'){const b=response.bytes;check(response.mediaType==='image/png'?b.length>=8&&Buffer.from(b.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255,'SOURCE_MEDIA');}
    return {requestedUrl:start,finalUrl:u.href,status:200,mediaType:response.mediaType,bytes:Buffer.from(response.bytes)};
  }
  check(false,'SOURCE_REDIRECT');
}
