import {tests,aggregateExpectations} from './fixtures.mjs';
import {score,compareArms,labels} from './score.mjs';
const results=tests.map(t=>{let actual;try{actual=score(t.output,t.reference,t.source);}catch(e){actual={exception:e.message};}const pass=Object.entries(t.expected).every(([k,v])=>actual[k]===v);return {id:t.id,pass,expected:t.expected,actual};});
const cases=labels.map((classification,i)=>({sourceId:'T'+i,classification,split:'eval'}));
const ok={formatValid:true,completeCorrect:true,normalPass:true,majorError:false,unknownSpanIds:[],authorityViolations:0};
const rows=()=>['B','C'].flatMap(arm=>cases.flatMap(c=>[0,1].map(repeat=>({arm,sourceId:c.sourceId,split:'eval',repeat,score:structuredClone(ok)}))));
function improve(){const r=rows();for(const x of r.filter(x=>x.arm==='B'&&x.sourceId==='T2'))Object.assign(x.score,{completeCorrect:false,majorError:true,normalPass:false});return r;}
const actuals=[];
let r=rows();for(const x of r)Object.assign(x.score,{majorError:true,completeCorrect:false,normalPass:false});actuals.push(compareArms(r,cases,true).advantageCandidate);
actuals.push(compareArms(rows(),cases,true).advantageCandidate);
actuals.push(compareArms(improve(),cases,true).B.errorCases);
actuals.push(compareArms(improve(),cases,true).advantageCandidate);
r=improve();r.find(x=>x.arm==='C').score.formatValid=false;actuals.push(compareArms(r,cases,true).advantageCandidate);
r=improve();r.find(x=>x.arm==='C').score.unknownSpanIds=['FAKE'];actuals.push(compareArms(r,cases,true).advantageCandidate);
r=improve();for(const x of r.filter(x=>x.arm==='C'&&x.sourceId==='T0'))Object.assign(x.score,{majorError:true,completeCorrect:false,normalPass:false});actuals.push(compareArms(r,cases,true).advantageCandidate);
aggregateExpectations.forEach((t,i)=>results.push({id:t.id,expected:t.expected,actual:actuals[i],pass:t.expected===actuals[i]}));
const out={kind:'SYNTHETIC_SCORER_TESTS_NOT_MODEL_EVALUATION',at:new Date().toISOString(),total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
console.log(JSON.stringify(out,null,2));process.exitCode=out.failed?1:0;
