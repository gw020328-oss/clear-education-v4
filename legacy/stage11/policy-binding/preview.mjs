// Explicit manual/offline path. No model call, wallet key, deployment, or payment.
import fs from 'node:fs';
import {createCompiler} from './core.mjs';
const [file]=process.argv.slice(2);
if(!file){console.error('Usage: node stage11/policy-binding/preview.mjs stage11/artifacts/binding-RUN/results.json');process.exitCode=2;}else{
 try{
  const {trust,bundle,now}=JSON.parse(fs.readFileSync(file,'utf8')).publicBase;
  const plan=createCompiler(trust)(bundle,now);
  console.log(JSON.stringify({mode:'OFFLINE_SYNTHETIC_REVIEW_PREVIEW',plan,warning:'The input registry is the explicit local trust root. Do not treat a downloaded registry as trusted. No live reserve observed, no deployment or payment.'},null,2));
 }catch(e){console.error(e.code??e.message);process.exitCode=1;}
}
