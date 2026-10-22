import {createHash,createHmac} from 'node:crypto';
import {canonical,freeze,exactKeys} from '../policy/values.mjs';
export {canonical,freeze};
export class EvidenceError extends Error {constructor(code){super(code);this.code=code;}}
export const check=(ok,code)=>{if(!ok)throw new EvidenceError(code);};
export const keys=(v,k,code='SHAPE')=>{try{exactKeys(v,k,code);}catch{throw new EvidenceError(code);}};
export const hash=(domain,value)=>'0x'+createHash('sha256').update('CLEAR-HACKERRANK-'+domain+'.1\n'+canonical(value)).digest('hex');
export const privateHash=(key,domain,value)=>'0x'+createHmac('sha256',key).update('CLEAR-HACKERRANK-'+domain+'.1\n'+canonical(value)).digest('hex');
export const isHash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
export const isAddress=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'0'.repeat(40);
export const isId=x=>typeof x==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(x);
export const isSourceId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
export const epoch=x=>Number.isSafeInteger(x)&&x>=0;
// Bounded JSON parser rejects duplicate keys (including escaped aliases) before
// interpretation. Source JSON may have whitespace/key order unlike canonical JSON.
export function strictJson(text,max=65536){
 check(typeof text==='string'&&Buffer.byteLength(text)<=max,'SIGNED_JSON');let i=0,nodes=0;
 const ws=()=>{while(/[ \r\n\t]/.test(text[i]??'x'))i++;};
 function string(){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"'){try{return JSON.parse(text.slice(start,i));}catch{break;}}}throw new EvidenceError('SIGNED_JSON');}
 function value(depth){
  check(depth<=24&&++nodes<=4096,'SIGNED_JSON_LIMIT');ws();let out;
  if(text[i]==='"')return string();
  if(text[i]==='{'||text[i]==='['){const object=text[i++]==='{',end=object?'}':']';out=object?{}:[];const seen=new Set();ws();if(text[i]===end){i++;return out;}
   for(;;){let k;if(object){check(text[i]==='"','SIGNED_JSON');k=string();check(!seen.has(k)&&!['__proto__','constructor','prototype'].includes(k),'DUPLICATE_OR_UNSAFE_JSON_KEY');seen.add(k);ws();check(text[i++]===':','SIGNED_JSON');}
    const child=value(depth+1);if(object)out[k]=child;else out.push(child);ws();if(text[i]===end){i++;return out;}check(text[i++]==',','SIGNED_JSON');ws();}
  }
  for(const [token,v] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return v;}
  const m=/^-?(?:0|[1-9][0-9]*)/.exec(text.slice(i));check(m,'SIGNED_JSON');i+=m[0].length;out=Number(m[0]);check(Number.isSafeInteger(out),'SIGNED_JSON');return out;
 }
 const result=value(0);ws();check(i===text.length,'SIGNED_JSON');return result;
}
