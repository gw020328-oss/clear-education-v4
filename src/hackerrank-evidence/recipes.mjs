import {canonical,check,keys,isSourceId} from './values.mjs';
export const ACCOUNT_URL='https://www.hackerrank.com/dashboard';
export const CERTIFICATE_URL='https://www.hackerrank.com/community/v1/test_results/hacker_certificate';
export function parametersFor(recipe,role,username){
 const p=structuredClone(recipe[role]);
 if(role==='certificate'){check(isSourceId(username),'SOURCE_USERNAME');p.url=CERTIFICATE_URL+'?username='+encodeURIComponent(username);}
 return p;
}
export function validateRecipe(recipe){
 keys(recipe,['version','account','certificate','recordShape'],'RECIPE_SHAPE');
 check(recipe.version==='hackerrank-two-proof.1'&&recipe.recordShape==='username-certificate_id-certificate_name-status.1','RECIPE_VERSION');
 for(const role of ['account','certificate']){
  const p=recipe[role];check(p&&p.method==='GET'&&p.url===(role==='account'?ACCOUNT_URL:CERTIFICATE_URL),'RECIPE_SOURCE');
  check(Array.isArray(p.responseMatches)&&p.responseMatches.length>0&&Array.isArray(p.responseRedactions),'RECIPE_EXTRACTION');
  check(!Object.hasOwn(p,'paramValues'),'RECIPE_SUBSTITUTION');
  const group=role==='account'?'username':'records';
  check(p.responseMatches.length===1&&p.responseMatches[0].type==='regex'&&!p.responseMatches[0].invert
   &&typeof p.responseMatches[0].value==='string'&&p.responseMatches[0].value.includes('(?<'+group+'>'),'RECIPE_REQUIRED_CAPTURE');
 }
 canonical(recipe);return recipe;
}
// This profile is an UNVERIFIED recipe candidate for invented HTTP bodies only.
// No real dashboard markup or private certificate claim was read to create it.
export function syntheticRecipe(){return {
 version:'hackerrank-two-proof.1',recordShape:'username-certificate_id-certificate_name-status.1',
 account:{url:ACCOUNT_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},responseRedactions:[],responseMatches:[{type:'regex',value:'(?:^|\\r\\n\\r\\n)<synthetic-account-control>(?<username>[A-Za-z0-9_-]+)</synthetic-account-control>$'}]},
 certificate:{url:CERTIFICATE_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},responseRedactions:[],responseMatches:[{type:'regex',value:'(?:^|\\r\\n\\r\\n)\\{"data":(?<records>\\[[\\s\\S]*\\])\\}$'}]},
};}
