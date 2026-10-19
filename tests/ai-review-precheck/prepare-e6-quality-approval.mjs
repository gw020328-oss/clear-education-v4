// No ACTUAL option exists. This writes approval artifacts only.
import {mkdirSync,writeFileSync} from 'node:fs';
import {prepareE6QualityPlan} from './e6-quality-plan.mjs';
if(process.argv.length!==2)throw Error('E6_QUALITY_PLAN_ONLY');
const bundle=prepareE6QualityPlan(),out=new URL('../../artifacts/e6-python-quality-approval/',import.meta.url);
mkdirSync(out,{recursive:true});
for(const [name,value] of Object.entries(bundle))writeFileSync(new URL(name+'.json',out),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify(bundle.plan,null,2));
