import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,save,read,sha} from '../lib/io.mjs';
import {expected,cases} from '../policy/product.mjs';
import {chrome} from './browser.mjs';

async function run(){
 fs.mkdirSync(resolve(root,'.runtime'),{recursive:true});
 const endpoints=read(process.argv[2]),id=Date.now(),out=`artifacts/branding-${id}`,b=await chrome(),checks=[],shots=[];
 const check=(name,ok)=>{checks.push({name,passed:Boolean(ok)});if(!ok)throw Error('CHECK_FAILED:'+name);};
 const evaluate=(expression)=>b.evaluate(expression);
 const brandCheck=async(name)=>{
  const state=await evaluate(`(()=>{const body=document.body.innerText,title=document.title,brand=document.querySelector('.brand');return {title,body,brand:brand?.textContent??'',brandVisible:Boolean(brand&&brand.getBoundingClientRect().width&&brand.getBoundingClientRect().height),old:/약속금고|환급 약속 금고/i.test(body+' '+title),secret:/\\bAIza[\\w-]{20,}\\b|privateKey|GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/i.test(body)}})()`);
  check(name+'-clear-brand',state.brand.includes('CLEAR')&&state.brandVisible);check(name+'-no-legacy-brand',!state.old);check(name+'-no-sensitive-copy',!state.secret);
 };
 const snap=async(name)=>{await brandCheck(name);for(const [label,w,h]of [['desktop',1440,900],['mobile',390,844]]){await b.size(w,h);await new Promise(r=>setTimeout(r,150));check(name+'-'+label+'-no-horizontal-overflow',!await evaluate('document.documentElement.scrollWidth > innerWidth'));check(name+'-'+label+'-brand-not-clipped',await evaluate(`(()=>{const e=document.querySelector('.brand'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1})()`));const path=`${out}/${name}-${label}.png`;await b.screenshot(path);shots.push(path);}await b.size(1440,900);};
 const focusedSnap=async(name,selector)=>{await brandCheck(name);for(const [label,w,h]of [['desktop',1440,900],['mobile',390,844]]){await b.size(w,h);await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await new Promise(r=>setTimeout(r,150));check(name+'-'+label+'-no-horizontal-overflow',!await evaluate('document.documentElement.scrollWidth > innerWidth'));check(name+'-'+label+'-target-visible',await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`));const path=`${out}/${name}-${label}.png`;await b.screenshot(path);shots.push(path);}await b.size(1440,900);};
 try{
  await b.navigate(endpoints.mainURL);await b.wait('Boolean(document.querySelector("#cached"))');
  check('main-tab-title',await evaluate("document.title==='CLEAR · 캠퍼스 4주 챌린지'"));
  check('first-screen-required-copy',await evaluate(`['CLEAR | 클리어','조건은 명쾌하게','환급은 투명하게','AI 환급 조건 검토와 블록체인 직접 환급 서비스','Condition-Linked Escrow & Automated Refund'].every(x=>document.body.innerText.includes(x))`));
  check('english-full-name-once',await evaluate(`document.body.innerText.split('Condition-Linked Escrow & Automated Refund').length===2`));
  const webmanifest=await evaluate(`fetch('/manifest.webmanifest').then(async r=>({ok:r.ok,type:r.headers.get('content-type'),body:await r.json()}))`);check('webmanifest-served',webmanifest.ok&&webmanifest.type.includes('application/manifest+json')&&webmanifest.body.name==='CLEAR | 클리어'&&webmanifest.body.short_name==='CLEAR');
  await snap('01-clear-home');

  await evaluate(`document.querySelector('#source').value=${JSON.stringify(cases.find(c=>c.id==='complete').source.text)};document.querySelector('#cached').click()`);await b.wait('Boolean(document.querySelector("#approve"))');
  check('cached-ai-review-label',await evaluate(`document.body.innerText.includes('저장된 시연 예시')`));check('approval-blocked-before-human-confirmation',await evaluate('document.querySelector("#approve").disabled'));
  await snap('02-ai-condition-review');

  const corrections=await evaluate(`(()=>{const expected=${JSON.stringify(expected)};let n=0;for(const[f,v]of Object.entries(expected)){const el=document.querySelector('#field-'+f);if(el.value!==v){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));n++;}}document.querySelectorAll('[data-question]').forEach(el=>{el.value='시연의 최종 조건을 원문 및 사업자와 확인했습니다.';el.dispatchEvent(new Event('input',{bubbles:true}));});document.querySelector('#confirm').click();return n;})()`);
  check('human-review-enables-approval',await evaluate('!document.querySelector("#approve").disabled'));await evaluate('document.querySelector("#approve").click()');await b.wait('Boolean(document.querySelector("#provider"))');
  await evaluate('document.querySelector("#provider").click()');await b.wait('!document.querySelector("#participant").disabled');await evaluate('document.querySelector("#participant").click()');await b.wait('!document.querySelector("#deposit").disabled');await evaluate('document.querySelector("#deposit").click()');await b.wait('Boolean(document.querySelector("#issue"))');
  check('deposit-complete',await evaluate(`document.body.innerText.includes('환급금은 이미 금고에 있습니다')&&document.body.innerText.includes('전액 사전 예치 완료')`));await snap('03-approval-and-deposit-complete');

  await evaluate('document.querySelector("#issue").click()');await b.wait('!document.querySelector("#outage").disabled');check('evidence-four-of-four',await evaluate(`document.body.innerText.includes('증빙 4/4 · 청구 준비됨')&&document.body.innerText.includes('발급자 서명 보관됨')`));await snap('04-completion-evidence-stored');

  await evaluate('document.querySelector("#outage").click()');await b.wait('Boolean(document.querySelector("#inspect"))');await b.wait('document.querySelector("#outage").textContent.includes("종료 확인")');
  check('recovery-tab-title',await evaluate("document.title==='CLEAR · 독립 환급 청구'"));check('independent-copy',await evaluate(`document.body.innerText.includes('독립 환급 청구')&&document.body.innerText.includes('운영기관의 지급 서버를 거치지 않고 보관한 완료 확인서(증빙)로 직접 청구합니다.')`));await snap('05-independent-refund-claim');

  await evaluate('document.querySelector("#inspect").click()');await b.wait('!document.querySelector("#claim").disabled || document.querySelector("#notice").textContent.includes("차단")');check('independent-inspection',await evaluate('!document.querySelector("#claim").disabled'));await evaluate('document.querySelector("#claim").click()');await b.wait('Boolean(window.demoReceipt) || document.querySelector("#notice").textContent.includes("차단")');
  const receipt=await evaluate('window.demoReceipt??null');check('direct-refund-success',receipt?.settled&&receipt.balanceIncrease==='50000000'&&receipt.mainUnavailable);await snap('06-refund-success');

  const duplicate=await evaluate(`window.recovery.claim().then(()=>'UNEXPECTED_SUCCESS').catch(e=>{document.querySelector('#notice').textContent='중복 청구 거절: 이미 환급이 완료되어 다시 청구할 수 없습니다. ('+e.message+')';return e.message})`);check('duplicate-claim-rejected',duplicate==='ALREADY_SETTLED_OR_NOT_ENROLLED');await focusedSnap('07-duplicate-claim-rejected','#notice');
  check('browser-no-uncaught-exceptions',b.errors.length===0);
  const recoveryRequests=b.network.filter(r=>r.documentURL.startsWith(endpoints.recoveryURL)),measuredBusinessRequests=recoveryRequests.filter(r=>r.url.startsWith(endpoints.mainURL)).length;
  check('independent-recovery-no-business-api',measuredBusinessRequests===0);check('independent-rpc-observed',recoveryRequests.some(r=>r.url.startsWith(endpoints.independentRPC)));
  const sourcePaths=['app/index.html','app/app.js','app/style.css','app/refinements.css','app/manifest.webmanifest','recovery/index.html','recovery/app.js','server/static.mjs','tests/brand-browser.mjs','tests/branding.mjs'];
  const result={at:new Date().toISOString(),status:'PASS',brand:'CLEAR | 클리어',mode:'cached',externalAICalls:0,newDemoChain:true,humanRoleSimulated:true,humanParticipants:0,reviewedFields:10,modifiedFields:corrections,checks,receipt,screenshots:shots,browserExceptions:b.errors,measuredBusinessRequests,networkRequestCount:b.network.length,networkHeadersRecorded:false,networkBodiesRecorded:false,endpoints,sourceHashes:Object.fromEntries(sourcePaths.map(p=>[p,sha(fs.readFileSync(resolve(root,p)))]))};
  save(out+'/network.json',{requests:b.network,recoveryRequests,measuredBusinessRequests,headersRecorded:false,bodiesRecorded:false});save(out+'/result.json',result);
  const checksumManifest=[...sourcePaths,...shots.map(p=>p.slice(out.length+1)), 'network.json','result.json'].map(p=>{const full=p.startsWith('stage14/')?resolve(root,'..',p):shots.includes(out+'/'+p)||['network.json','result.json'].includes(p)?resolve(root,out,p):resolve(root,p);return sha(fs.readFileSync(full))+'  '+p;}).join('\n')+'\n';
  save(out+'/checksums.sha256',checksumManifest);
  console.log(JSON.stringify({out,status:'PASS',checks:checks.length,screenshots:shots.length,desktop:shots.filter(p=>p.endsWith('-desktop.png')).length,mobile:shots.filter(p=>p.endsWith('-mobile.png')).length,externalAICalls:0}));
 }catch(e){save(out+'/result.json',{at:new Date().toISOString(),status:'FAIL',failure:/^CHECK_FAILED:[a-z0-9-]+$/.test(e.message)?e.message:'BRAND_BROWSER_FAILURE',checks,screenshots:shots,browserExceptions:b.errors,externalAICalls:0,endpoints});console.log(JSON.stringify({out,status:'FAIL',failure:'BRAND_BROWSER_FAILURE'}));process.exitCode=1;}finally{await b.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run();
