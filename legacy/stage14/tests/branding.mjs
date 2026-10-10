import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,read,save,sha} from '../lib/io.mjs';

const results=[];
const run=(id,fn)=>{try{fn();results.push({id,passed:true});}catch{results.push({id,passed:false,error:'BRANDING_ASSERTION_FAILED'});}};
const text=p=>fs.readFileSync(resolve(root,p),'utf8');
const currentUserSurfaces=['app/index.html','app/app.js','recovery/index.html'];
const compatibilityIdentifiers=['RefundVault','callGemini','GEMINI_API_KEY','/api/draft','PolicyProposalV1','termsHash'];

run('current-user-surfaces-have-no-legacy-brand',()=>{
 for(const p of currentUserSurfaces){const source=text(p);assert.doesNotMatch(source,/약속금고|환급 약속 금고/i);}
});
run('clear-brand-copy-is-present',()=>{
 const main=text('app/index.html')+text('app/app.js'),recovery=text('recovery/index.html');
 for(const phrase of ['CLEAR','CLEAR | 클리어','조건은 명쾌하게, 환급은 투명하게','AI 환급 조건 검토와 블록체인 직접 환급 서비스'])assert.ok(main.includes(phrase));
 assert.ok(main.includes('Condition-Linked Escrow &amp; Automated Refund'));
 for(const phrase of ['CLEAR','독립 환급 청구','운영기관의 지급 서버를 거치지 않고 보관한 완료 확인서(증빙)로 직접 청구합니다.'])assert.ok(recovery.includes(phrase));
});
run('browser-metadata-and-webmanifest',()=>{
 const main=text('app/index.html'),recovery=text('recovery/index.html'),manifest=read('app/manifest.webmanifest');
 assert.match(main,/<title>CLEAR · 캠퍼스 4주 챌린지<\/title>/);assert.match(recovery,/<title>CLEAR · 독립 환급 청구<\/title>/);
 for(const html of [main,recovery]){assert.match(html,/name="application-name" content="CLEAR"/);assert.match(html,/property="og:title"/);assert.match(html,/property="og:description"/);assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);}
 assert.deepEqual({name:manifest.name,short_name:manifest.short_name,description:manifest.description},{name:'CLEAR | 클리어',short_name:'CLEAR',description:'AI 환급 조건 검토와 블록체인 직접 환급 서비스'});
 assert.equal(text('server/static.mjs').includes("'/manifest.webmanifest':'app/manifest.webmanifest'"),true);
});
run('functional-vault-language-remains-generic',()=>{
 const surface=currentUserSurfaces.map(text).join('\n');assert.match(surface,/온체인 금고/);assert.match(surface,/내 환급 금고/);assert.match(surface,/사전 예치/);
});
run('compatibility-identifiers-unchanged',()=>{
 const corpus=['server/demo.mjs','server/main.mjs','ai/client.mjs','policy/product.mjs','policy/binding.mjs','recovery/app.js'].map(text).join('\n');
 for(const identifier of compatibilityIdentifiers)assert.ok(corpus.includes(identifier));
});
run('no-secret-shaped-user-copy',()=>{
 const surface=currentUserSurfaces.map(text).join('\n');assert.doesNotMatch(surface,/\bAIza[\w-]{20,}\b|["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+/i);assert.doesNotMatch(surface,/privateKey|GEMINI_API_KEY|GOOGLE_API_KEY/);
});
run('historical-brand-evidence-retained',()=>{
 assert.ok(text('artifacts/ui-handoff.json').includes('약속금고'));
 assert.ok(text('artifacts/reconciliation/original/README.md').includes('약속금고'));
 assert.equal(sha(fs.readFileSync(resolve(root,'checksums.sha256'))),'c4d446bd4a07683da937d98ceb216bdec48f9bd2c450385e531e3c0af6361ebb');
});

export function brandingReport(){return {at:new Date().toISOString(),suite:'CLEAR_STATIC_BRAND_AND_COMPATIBILITY',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results,currentUserSurfaces,compatibilityIdentifiers,historicalEvidenceModified:false,existingChecksumRecordModified:false,externalAICalls:0};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=brandingReport(),path='artifacts/branding-static-'+Date.now()+'.json';save(path,report);console.log(JSON.stringify({path,passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;}
