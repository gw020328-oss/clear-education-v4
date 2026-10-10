// Generate an isolated filming supervisor using unchanged production flow modules.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {root,project,save} from '../lib/io.mjs';
const auth='artifacts/clear-video-extra-call-authorization.json';
if(!fs.existsSync(resolve(root,auth)))save(auth,{at:new Date().toISOString(),purpose:'Competition video live AI generation',userApproved:true,additionalHTTPTransmissions:1,maximumAdditionalUSD:.03,retries:0,priorTransmissions:6,originalAuthorizationUSD:1,originalAuthorizationHTTP:6,newCumulativeHTTPMaximum:7,noCacheOrHistoricalEvaluationRewrite:true,actualBilledCostUSD:null});
const dir=fs.mkdtempSync(resolve(root,'.runtime/film-server-'));
const rewrite=s=>s.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(resolve(root,'server',p)).href}'`);
const main=rewrite(fs.readFileSync(resolve(root,'server/main.mjs'),'utf8')).replace(pathToFileURL(resolve(root,'ai/client.mjs')).href,pathToFileURL(resolve(root,'tests/film-ai.mjs')).href);
const demo=rewrite(fs.readFileSync(resolve(root,'server/demo.mjs'),'utf8')).replace("resolve(root,'server/main.mjs')",JSON.stringify(resolve(dir,'main.mjs')));
fs.writeFileSync(resolve(dir,'main.mjs'),main,{flag:'wx'});fs.writeFileSync(resolve(dir,'demo.mjs'),demo,{flag:'wx'});
const env={PATH:process.env.PATH};if(process.env.GEMINI_API_KEY)env.GEMINI_API_KEY=process.env.GEMINI_API_KEY;if(process.env.GOOGLE_API_KEY)env.GOOGLE_API_KEY=process.env.GOOGLE_API_KEY;
const child=spawn(process.execPath,[resolve(dir,'demo.mjs')],{cwd:project,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??1;});
