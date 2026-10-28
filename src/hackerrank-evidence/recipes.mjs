import {canonical,check,keys,isSourceId} from './values.mjs';
import {NESTED_RECORD_SHAPE} from './source-records.mjs';
export const ACCOUNT_URL='https://www.hackerrank.com/dashboard';
export const CERTIFICATE_URL='https://www.hackerrank.com/community/v1/test_results/hacker_certificate';
export const WORKER_RECIPE_VERSION='hackerrank-two-proof.3';
export const WORKER_RECORD_SHAPE='worker-selected-certificate-fields.1';
const ROW_SELECTOR='$.data[?(@.attributes.certificate.track_slug=="python_basic")]';
export const usesWorkerSource=recipe=>recipe?.version===WORKER_RECIPE_VERSION&&recipe?.recordShape===WORKER_RECORD_SHAPE;
export function parametersFor(recipe,role,username,selectedCertificateId=null){
 const p=structuredClone(recipe[role]);
 if(role==='certificate'){check(isSourceId(username),'SOURCE_USERNAME');p.url=CERTIFICATE_URL+'?username='+encodeURIComponent(username);}
 if(role==='certificate'&&usesWorkerSource(recipe)&&selectedCertificateId!==null){
  check(isSourceId(selectedCertificateId),'REQUEST_SELECTION');
  for(const redaction of p.responseRedactions)redaction.jsonPath=redaction.jsonPath.replace(ROW_SELECTOR,'$.data[?(@.id=="'+selectedCertificateId+'")]');
 }
 return p;
}
export function validateRecipe(recipe){
 keys(recipe,['version','account','certificate','recordShape'],'RECIPE_SHAPE');
 const flat=recipe.version==='hackerrank-two-proof.1'&&recipe.recordShape==='username-certificate_id-certificate_name-status.1';
 const nested=recipe.version==='hackerrank-two-proof.2'&&recipe.recordShape===NESTED_RECORD_SHAPE;
 const worker=usesWorkerSource(recipe);check(flat||nested||worker,'RECIPE_VERSION');
 if(worker){check(canonical(recipe)===canonical(workerRecipe()),'WORKER_RECIPE_POLICY');return recipe;}
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
// These selectors disclose field pairs only. The managed worker must inspect
// the same TLS response and compare the actual SDK extraction before proving.
// A recipe alone never grants TRUSTED_WORKER provenance.
export function workerRecipe(){
 const pair=(key,group,value)=>'"'+key+'"\\s*:\\s*"(?<'+group+'>'+value+')"';
 const account=pair('username','username','[A-Za-z0-9_-]{1,80}');
 const fields=[
  ['id','certificate_id',ROW_SELECTOR,'[A-Za-z0-9_-]{1,80}'],
  ['username','username',ROW_SELECTOR+'.attributes','[A-Za-z0-9_-]{1,80}'],
  ['status','status',ROW_SELECTOR+'.attributes','test_passed|test_failed'],
  ['label','certificate_label',ROW_SELECTOR+'.attributes.certificate','Python'],
  ['level','certificate_level',ROW_SELECTOR+'.attributes.certificate','Basic'],
  ['track_slug','certificate_slug',ROW_SELECTOR+'.attributes.certificate','python_basic'],
 ];
 return {version:WORKER_RECIPE_VERSION,recordShape:WORKER_RECORD_SHAPE,
  account:{url:ACCOUNT_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},
   responseRedactions:[{xPath:'//script[@id="__NEXT_DATA__"]',jsonPath:'$.props.pageProps.prefetchedData.profile',regex:account}],
   responseMatches:[{type:'regex',value:account}]},
  certificate:{url:CERTIFICATE_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},
   responseRedactions:fields.map(([key,group,jsonPath,value])=>({jsonPath,regex:pair(key,group,value)})),
   responseMatches:fields.map(([key,group,_path,value])=>({type:'regex',value:pair(key,group,value)}))},
 };
}
// This profile is an UNVERIFIED recipe candidate for invented HTTP bodies only.
// No real dashboard markup or private certificate claim was read to create it.
export function syntheticRecipe(){return {
 version:'hackerrank-two-proof.1',recordShape:'username-certificate_id-certificate_name-status.1',
 account:{url:ACCOUNT_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},responseRedactions:[],responseMatches:[{type:'regex',value:'(?:^|\\r\\n\\r\\n)<synthetic-account-control>(?<username>[A-Za-z0-9_-]+)</synthetic-account-control>$'}]},
 certificate:{url:CERTIFICATE_URL,method:'GET',headers:{'User-Agent':'reclaim/0.0.1'},responseRedactions:[],responseMatches:[{type:'regex',value:'(?:^|\\r\\n\\r\\n)\\{"data":(?<records>\\[[\\s\\S]*\\])\\}$'}]},
};}
