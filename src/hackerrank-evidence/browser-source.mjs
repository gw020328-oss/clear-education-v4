import {ACCOUNT_URL,CERTIFICATE_URL} from './recipes.mjs';
import {check,isSourceId} from './values.mjs';

// This port is bound to the fresh managed browser, never a user's default
// profile. Only cookies applicable to the two fixed source URLs are requested.
export function browserCookieReader(browser,sessionId){
 return async({role,url,signal})=>{
  signal?.throwIfAborted();
  let allowed=role==='account'&&url===ACCOUNT_URL;
  if(role==='certificate'){
   const u=new URL(url),username=u.searchParams.get('username');
   allowed=isSourceId(username)&&url===CERTIFICATE_URL+'?username='+encodeURIComponent(username);
  }
  check(allowed,'COLLECTOR_SOURCE_URL');
  const {cookies}=await browser.send('Network.getCookies',{urls:[url]},sessionId);signal?.throwIfAborted();
  check(Array.isArray(cookies)&&cookies.length>0&&cookies.length<=64,'COLLECTOR_COOKIES');
  const names=new Set();
  const value=cookies.map(c=>{
   check(['www.hackerrank.com','.www.hackerrank.com','hackerrank.com','.hackerrank.com'].includes(c.domain),'COLLECTOR_COOKIE_DOMAIN');
   check(typeof c.name==='string'&&/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/.test(c.name)&&!names.has(c.name),'COLLECTOR_COOKIE_NAME');names.add(c.name);
   check(typeof c.value==='string'&&/^[\x21-\x7e]*$/.test(c.value)&&!/[;,]/.test(c.value),'COLLECTOR_COOKIE_VALUE');
   return c.name+'='+c.value;
  }).join('; ');
  check(value.length<=16384,'COLLECTOR_COOKIES');return value;
 };
}
