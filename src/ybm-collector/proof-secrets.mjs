import {endpoints,methods} from './source-policy.mjs';
import {requireValue} from './values.mjs';
// Only called for the two allowlisted responses after ready. No browser-wide
// cookie dump or Network recording. Values remain local and never enter IPC.
export function createProofSecrets(browser){
  const secrets=new Map();let closed=false;
  return {
    async capture(role,request,sessionId){
      requireValue(!closed&&request.url===endpoints[role]&&request.method===methods[role]&&!secrets.has(role),'SECRET_SCOPE');
      let paramValues;
      if(role==='registration'){
        requireValue(typeof request.postData==='string'&&request.postData.length<=16384,'SOURCE_REQUEST_BODY');
        const match=/^encExamData=([A-Za-z0-9%+/_=-]{1,16000})&zzxxcc=$/.exec(request.postData);
        requireValue(match&&!/%(?![0-9a-fA-F]{2})/.test(match[1]),'SOURCE_REQUEST_BODY');
        // Preserve encoded bytes; the pinned provider substitutes verbatim.
        paramValues={encExamData:match[1]};
      }
      const {cookies}=await browser.send('Network.getCookies',{urls:[endpoints[role]]},sessionId);
      requireValue(!closed&&Array.isArray(cookies)&&cookies.length>0&&cookies.length<=64,'SOURCE_COOKIES');
      const cookieStr=cookies.map(c=>{
        requireValue(typeof c.name==='string'&&/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/.test(c.name)&&typeof c.value==='string'&&/^[\x21-\x7e]*$/.test(c.value)&&!/[;,]/.test(c.value),'SOURCE_COOKIES');
        requireValue(typeof c.domain==='string'&&['exam.toeic.co.kr','.exam.toeic.co.kr','toeic.co.kr','.toeic.co.kr'].includes(c.domain),'SOURCE_COOKIE_DOMAIN');
        return c.name+'='+c.value;
      }).join('; ');
      requireValue(cookieStr.length<=16384,'SOURCE_COOKIES');
      secrets.set(role,{cookieStr,...(paramValues?{paramValues}:{})});
    },
    take(role){requireValue(!closed&&secrets.has(role),'SOURCE_SECRET_MISSING');const result=secrets.get(role);secrets.delete(role);return result;},
    close(){closed=true;secrets.clear();},
  };
}
