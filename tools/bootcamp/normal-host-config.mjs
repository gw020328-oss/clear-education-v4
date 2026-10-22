// Local owner configuration only. Never an HTTP/body configuration or source authority.
import {mkdirSync,existsSync,readFileSync,lstatSync,accessSync,constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {privateDirectory,readPrivate,atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
export const API_ROOT=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
export const HOST_PARENT=join(API_ROOT,'var/bootcamp-normal-host');
export const MOODLE_OWNER_ROOT=join(dirname(API_ROOT),'clear-moodle-review-api');
export const MOODLE_OWNER_HEAD='364871ea139daed385f8c0ccd7033d03b8f24928';
export const MOODLE_READER=join(MOODLE_OWNER_ROOT,'spikes/moodle-review-api/e6/runtime.mjs');
export const HOST_CONFIG_VERSION='clear-bootcamp-normal-host-config.1';
export const KEY_SOURCE='clear-e6-existing-server-gemini-env.1';
export const PRICING_SOURCE='https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite';
export const fail=(ok,code)=>{if(!ok)throw Error(code);};
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function codeState(){try{return {head:execFileSync('git',['rev-parse','HEAD'],{cwd:API_ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),clean:execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:API_ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()===''};}catch{throw Error('NORMAL_HOST_CODE_STATE');}}
export function hostDirectory(name){fail(/^[a-z][a-z0-9-]{0,40}$/.test(name??''),'NORMAL_HOST_NAME');return join(HOST_PARENT,name);}
export function validateHostConfig(c){
 fail(c?.version===HOST_CONFIG_VERSION&&c.apiRoot===API_ROOT&&c.keySourceId===KEY_SOURCE&&c.moodleReader===MOODLE_READER&&c.moodleOwnerHead===MOODLE_OWNER_HEAD,'NORMAL_HOST_CONFIG');
 const u=new URL(c.origin);fail(u.origin===c.origin&&u.protocol==='https:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024&&Number(u.port)<=65535,'NORMAL_HOST_ORIGIN');
 fail(c.audience==='clear-python-normal-local'&&/^hr-run\.[0-9a-f-]{36}$/.test(c.privacyKeyId??'')&&/^[0-9a-f]{64}$/.test(c.moodleReaderSha256??''),'NORMAL_HOST_CONFIG');
 const a=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0+$/.test(x);
 fail(c.participantWallet===null&&c.operatorWallet===null||a(c.participantWallet)&&a(c.operatorWallet)&&c.participantWallet!==c.operatorWallet,'NORMAL_HOST_WALLETS');
 fail(c.webRoot===null||typeof c.webRoot==='string'&&resolve(c.webRoot)===c.webRoot,'NORMAL_HOST_WEB_ROOT');
 fail(typeof c.frontendAccepted==='boolean'&&(c.frontendAssetSha256===null||/^[0-9a-f]{64}$/.test(c.frontendAssetSha256)),'NORMAL_HOST_FRONTEND');
 fail(c.selectedCertificateId===null||/^[A-Za-z0-9_-]{1,80}$/.test(c.selectedCertificateId??''),'NORMAL_HOST_SELECTION');return c;
}
export function assetSnapshot(webRoot){
 if(!webRoot||!existsSync(webRoot))return null;
 const assets=loadPublicAssets(webRoot);return sha(Buffer.concat([...assets].sort(([a],[b])=>a.localeCompare(b)).flatMap(([path,a])=>[Buffer.from(path+'\n'+a.type+'\n'),a.body])));
}
export function loadHostConfig(name){const directory=privateDirectory(hostDirectory(name));return {directory,config:validateHostConfig(JSON.parse(readPrivate(join(directory,'host.json'))))};}
export function initializeHost({name,origin='https://127.0.0.1:9445',webRoot=null}){
 mkdirSync(HOST_PARENT,{recursive:true,mode:0o700});privateDirectory(HOST_PARENT);const directory=hostDirectory(name);mkdirSync(directory,{mode:0o700});privateDirectory(directory);
 const st=lstatSync(MOODLE_READER);fail(st.isFile()&&!st.isSymbolicLink(),'NORMAL_HOST_MOODLE_READER');
 const c=validateHostConfig({version:HOST_CONFIG_VERSION,apiRoot:API_ROOT,origin,audience:'clear-python-normal-local',privacyKeyId:'hr-run.'+randomUUID(),
  participantWallet:null,operatorWallet:null,selectedCertificateId:null,webRoot:webRoot?resolve(webRoot):null,frontendAccepted:false,frontendAssetSha256:null,
  moodleReader:MOODLE_READER,moodleOwnerHead:MOODLE_OWNER_HEAD,moodleReaderSha256:sha(readFileSync(MOODLE_READER)),keySourceId:KEY_SOURCE,createdAt:Math.floor(Date.now()/1000)});
 c.tlsFingerprint=createCertificates(directory);atomicPrivate(join(directory,'host.json'),c,{exclusive:true});
 atomicPrivate(join(directory,'public-input-template.json'),{participantWallet:null,operatorWallet:null,selectedCertificateId:null,frontendAccepted:false,webRoot:c.webRoot},{exclusive:true});
 return {directory,origin,sourceMode:'REGISTERED_TEST_SOURCE',phase:'PREPARED_NOT_ACTIVATED',chainId:null,rpcUrl:null,applicationId:null};
}
export function configureHost({name,participantWallet,operatorWallet,webRoot,frontendAccepted=false,selectedCertificateId}){
 const {directory,config:c}=loadHostConfig(name);fail(!existsSync(join(directory,'run.used.json')),'NORMAL_HOST_ALREADY_USED');
 if(participantWallet!==undefined||operatorWallet!==undefined){c.participantWallet=participantWallet?.toLowerCase();c.operatorWallet=operatorWallet?.toLowerCase();}
 if(webRoot!==undefined){c.webRoot=resolve(webRoot);c.frontendAccepted=false;c.frontendAssetSha256=null;}
 if(selectedCertificateId!==undefined)c.selectedCertificateId=selectedCertificateId;
 if(frontendAccepted){c.frontendAssetSha256=assetSnapshot(c.webRoot);fail(c.frontendAssetSha256,'NORMAL_HOST_FRONTEND_MISSING');c.frontendAccepted=true;}
 validateHostConfig(c);atomicPrivate(join(directory,'host.json'),c);return {origin:c.origin,walletsConfigured:c.participantWallet!==null,frontendAccepted:c.frontendAccepted,chainId:null,applicationId:null};
}
export function readPriceReview(directory){
 const p=JSON.parse(readPrivate(join(privateDirectory(directory),'price-review.json')));
 fail(p.officialSource===PRICING_SOURCE&&p.reviewedOn===localDay()&&p.inputNanoUsdPerToken==='300'&&p.outputIncludingThinkingNanoUsdPerToken==='2500'
  &&p.basis==='PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION','NORMAL_HOST_PRICE_REVIEW_REQUIRED');
 return {...p,evidenceSha256:sha(JSON.stringify(p))};
}
export function hostReadiness({directory,config:c}){
 const blockers=[];
 const probe=fn=>{try{return fn();}catch{return false;}};
 const dockerAvailable=!!probe(()=>execFileSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:['ignore','pipe','pipe'],timeout:10000}).length);
 const gethAvailable=!!probe(()=>execFileSync('docker',['image','inspect','ethereum/client-go@sha256:abf3605177f8bdcfce436985a8054cca4ae59256323a4ffb72c56c04f3d1fadd','--format','{{.Id}}'],{stdio:['ignore','pipe','pipe'],timeout:10000}).length);
 const chromeAvailable=probe(()=>{accessSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',constants.X_OK);return true;});
 const moodleRunning=probe(()=>{const s=execFileSync('docker',['compose','-f',join(dirname(MOODLE_READER),'compose.yml'),'ps','--format','json'],{stdio:['ignore','pipe','pipe'],timeout:10000}).toString().trim();const rows=s.startsWith('[')?JSON.parse(s):s.split('\n').map(x=>JSON.parse(x));return rows.some(x=>x.Service==='db'&&x.State==='running'&&x.Health==='healthy')&&rows.some(x=>x.Service==='web'&&x.State==='running');});
 if(!dockerAvailable)blockers.push('DOCKER_UNAVAILABLE');if(!gethAvailable)blockers.push('PINNED_GETH_IMAGE_UNAVAILABLE');if(!chromeAvailable)blockers.push('MANAGED_CHROME_UNAVAILABLE');if(!moodleRunning)blockers.push('LOCAL_MOODLE_SERVICE_UNAVAILABLE');
 if(process.versions.node!=='24.21.0'||process.platform!=='darwin'||process.arch!=='arm64')blockers.push('PINNED_MAC_RUNTIME_REQUIRED');if(!c.participantWallet)blockers.push('PUBLIC_ROLE_ADDRESSES_REQUIRED');
 const asset=assetSnapshot(c.webRoot);if(!asset)blockers.push('FRONTEND_PUBLIC_FILES_REQUIRED');
 if(!c.frontendAccepted||asset!==c.frontendAssetSha256)blockers.push('FRONTEND_CONTRACT_ACCEPTANCE_REQUIRED');
 const keyAvailable=typeof process.env.GEMINI_API_KEY==='string'&&process.env.GEMINI_API_KEY.trim().length>0;
 if(!keyAvailable)blockers.push('EXISTING_GEMINI_ENV_UNAVAILABLE');
 const ownerMatches=probe(()=>execFileSync('git',['rev-parse','HEAD'],{cwd:MOODLE_OWNER_ROOT,stdio:['ignore','pipe','pipe']}).toString().trim()===MOODLE_OWNER_HEAD&&execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:MOODLE_OWNER_ROOT,stdio:['ignore','pipe','pipe']}).toString().trim()==='');
 if(!ownerMatches)blockers.push('MOODLE_OWNER_SOURCE_CHANGED');
 const readerMatches=existsSync(c.moodleReader)&&sha(readFileSync(c.moodleReader))===c.moodleReaderSha256;if(!readerMatches)blockers.push('MOODLE_READER_CODE_CHANGED');
 let priceReview;try{priceReview=readPriceReview(directory);}catch{blockers.push('TODAY_PRICE_REVIEW_REQUIRED');}
 const aiSpent=existsSync(join(API_ROOT,'artifacts/e6-first-normal-reflection-run/spent.paid-wire.v3.lock'));if(aiSpent)blockers.push('FIRST_NORMAL_AI_JOURNAL_ALREADY_SPENT');
 const used=existsSync(join(directory,'run.used.json'));if(used)blockers.push('NORMAL_HOST_ALREADY_USED');
 const code=codeState();if(!code.clean)blockers.push('CLEAN_CODE_REQUIRED_FOR_ACTIVATION');
 loadTls(directory,c.tlsFingerprint);
 return {version:'clear-bootcamp-normal-host-readiness.1',origin:c.origin,sourceMode:'REGISTERED_TEST_SOURCE',readyForActivation:blockers.length===0,blockers,
  dockerAvailable,gethAvailable,chromeAvailable,moodleRunning,keyAvailable,keySourceId:KEY_SOURCE,moodleOwnerSourceMatches:ownerMatches,moodleReaderCodeMatches:readerMatches,frontendAssetsAvailable:!!asset,frontendAccepted:c.frontendAccepted,
  priceReview:priceReview?{reviewedOn:priceReview.reviewedOn,officialSource:PRICING_SOURCE,inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',scenarioUsd:'0.00346',hardCashCapVerified:false}:null,
  code,chainId:null,rpcUrl:null,applicationId:null,actualSourceVerified:false,actualCalls:0};
}
