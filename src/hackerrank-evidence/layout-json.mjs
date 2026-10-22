import {strictJson,freeze} from './values.mjs';

// Survey-only shape parser. No value-bearing JSON tree or caller-defined key
// vocabulary escapes this module. These limits do not change the verifier.
export const SURVEY_LIMITS=freeze({bytes:1048576,depth:48,nodes:32768,arrayItems:32});
const safeKeys=new Set([
 'props','pageProps','initialState','initialData','initialProps','state','store','session','auth',
 'current_hacker','currentHacker','current_user','currentUser','authenticatedUser','loggedInUser',
 'hacker','user','userInfo','userData','profile','profileData','account','me',
 'data','models','model','attributes','relationships','results','result','records','items',
 'test_results','testResults','certificates','certificate','certificate_data','certificateData',
 'test','details','username','user_name','handle','certificate_id','certificateId',
 'certificate_name','certificateName','status','id','name','title','user_id','hacker_id','test_id','testId',
]);
export const UNLISTED='{unlisted}';
const policyError=code=>{throw Object.assign(new Error(code),{code});};
const demand=(condition,code)=>{if(!condition)policyError(code);};
const unsafeKeys=new Set(['__proto__','constructor','prototype']);

// Independent diagnostic classification mirrors strictJson's limits in the
// first pass. The actual strictJson result remains authoritative for that pass.
export function scanLayoutJson(text,{maxBytes=65536,maxDepth=24,maxNodes=4096,integerOnly=true}={}){
 const numericForms=new Set();let i=0,nodes=0;
 try{
  demand(typeof text==='string'&&Buffer.byteLength(text)<=maxBytes,'SIZE_LIMIT');
  const ws=()=>{while(/[ \r\n\t]/.test(text[i]??'x'))i++;};
  function string(){
   demand(text[i]==='"','JSON_SYNTAX');const start=i++;
   while(i<text.length){
    if(text[i]==='\\'){i+=2;continue;}
    if(text[i++]==='"'){
     try{return JSON.parse(text.slice(start,i));}catch{policyError('JSON_SYNTAX');}
    }
   }
   policyError('JSON_SYNTAX');
  }
  function value(depth){
   demand(depth<=maxDepth,'DEPTH_LIMIT');demand(++nodes<=maxNodes,'NODE_LIMIT');ws();
   if(text[i]==='"'){string();return {type:'string'};}
   if(text[i]==='{'||text[i]==='['){
    const object=text[i++]==='{',end=object?'}':']',seen=new Set();
    const shape=object?{type:'object',entries:[]}:{type:'array',items:[],length:0};
    ws();if(text[i]===end){i++;return shape;}
    for(;;){
     let key;
     if(object){
      key=string();demand(!seen.has(key),'DUPLICATE_KEY');seen.add(key);
      demand(!unsafeKeys.has(key),'UNSAFE_KEY');ws();demand(text[i++]===':','JSON_SYNTAX');
     }
     const child=value(depth+1);
     if(object)shape.entries.push({key:safeKeys.has(key)?key:UNLISTED,node:child});
     else{shape.length++;if(shape.items.length<SURVEY_LIMITS.arrayItems)shape.items.push(child);}
     ws();if(text[i]===end){i++;return shape;}demand(text[i++]===',','JSON_SYNTAX');ws();
    }
   }
   for(const [token,type]of [['true','boolean'],['false','boolean'],['null','null']]){
    if(text.startsWith(token,i)){i+=token.length;return {type};}
   }
   const match=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
   demand(match,'JSON_SYNTAX');const token=match[0];i+=token.length;
   const form=/[eE]/.test(token)?'EXPONENT':token.includes('.')?'FRACTION':Number.isSafeInteger(Number(token))?'SAFE_INTEGER':'UNSAFE_INTEGER';
   numericForms.add(form);
   if(integerOnly)demand(form==='SAFE_INTEGER','NUMBER_'+form);
   return {type:'number'};
  }
  const shape=value(0);ws();demand(i===text.length,'JSON_SYNTAX');
  return {status:'ACCEPTED',numericForms:[...numericForms].sort(),shape};
 }catch(error){
  const codes=new Set(['SIZE_LIMIT','DEPTH_LIMIT','NODE_LIMIT','DUPLICATE_KEY','UNSAFE_KEY','JSON_SYNTAX','NUMBER_EXPONENT','NUMBER_FRACTION','NUMBER_UNSAFE_INTEGER']);
  return {status:codes.has(error?.code)?error.code:'DIAGNOSTIC_ERROR',numericForms:[...numericForms].sort()};
 }
}

export function inspectLayoutJson(text,maxBytes){
 let strictAccepted=false;
 try{strictJson(text);strictAccepted=true;}catch{}
 const first=scanLayoutJson(text),second=scanLayoutJson(text,{maxBytes,maxDepth:SURVEY_LIMITS.depth,maxNodes:SURVEY_LIMITS.nodes,integerOnly:false});
 const primaryStatus=strictAccepted?(first.status==='ACCEPTED'?'ACCEPTED':'DIAGNOSTIC_MISMATCH')
  :first.status==='ACCEPTED'?'DIAGNOSTIC_MISMATCH':first.status;
 return {
  strictAccepted,
  diagnostic:freeze({primaryStatus,secondaryStatus:second.status,numericForms:second.numericForms}),
  // A classification mismatch cannot yield a structural candidate.
  shape:primaryStatus==='DIAGNOSTIC_MISMATCH'?undefined:second.shape,
 };
}
