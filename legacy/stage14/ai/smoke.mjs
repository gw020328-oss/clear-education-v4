import {callGemini,budget,config} from './client.mjs';
import {save,read,root} from '../lib/io.mjs';
import fs from 'node:fs';
if(!fs.existsSync(root+'/ai/COST_LOCK.json'))save('ai/COST_LOCK.json',{at:new Date().toISOString(),config,officialPriceSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash',apiSource:'https://ai.google.dev/api/interactions-api',authorization:{maximumUSD:1,maximumHTTPTransmissions:6,maxFixedProductCases:3,maxRetryPerLogicalCall:1},billingChanges:false,actualBilledCostUSD:null});
const result=await callGemini(null,{smoke:true,caseId:'smoke'});console.log(JSON.stringify({status:result.status,model:result.actualModel,...budget()}));
