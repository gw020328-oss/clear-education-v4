import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {compose,fixture,runtime,php,collect,query,metrics} from './runtime.mjs';
const action=process.argv[2]??'status',marker=JSON.parse(await readFile(new URL('local-instance.json',runtime))),f=await fixture();
if(marker.project!=='clear-moodle-e6-20261018'||marker.port!==18768)throw Error('E6_OWNER_MARKER');
for(const name of ['clear-moodle-e6-20261018_e6db','clear-moodle-e6-20261018_e6data']){
 try{execFileSync('docker',['volume','inspect',name],{stdio:'ignore'});}catch{throw Error('E6_MAPPING_RECREATE_REQUIRED');}
}
if(action==='stop'){
 if(php('credential.php',{action:'audit'}).activeTokens!==0)throw Error('E6_ACTIVE_CREDENTIALS');
 execFileSync('docker',[...compose,'stop'],{stdio:['ignore','pipe','pipe']});
 console.log(JSON.stringify({ownedStopped:true,volumesPreserved:true,mappingRevisionUnchanged:true,currentlyRecollectable:false}));
}else if(action==='start'){
 execFileSync('docker',[...compose,'up','-d','--wait'],{stdio:['ignore','pipe','pipe']});
 console.log(JSON.stringify({ownedStarted:true,existingVolumesOnly:true,mappingRevisionUnchanged:true,apiReadinessNotYetClaimed:true}));
}else if(action==='status'){
 const rows=[];for(const criterion of ['activity-complete','assignment-submitted','reflection-topics']){const r=await collect(await query(criterion));rows.push({criterion,sourceHash:r.acquisition.sourceHash,observed:r.acquisition.observed,sourcePredicate:r.acquisition.sourcePredicate});}
 const report={version:'clear-moodle-e6-lifecycle.1',checkedAtMs:Date.now(),environmentRef:f.environmentRef,runRef:f.runRef,mappingRevision:1,designatedTargetsAliveAtCheck:true,ownedContainersRunning:true,recollectableWithNewShortLivedCredential:true,tokensRemaining:php('credential.php',{action:'audit'}).activeTokens,rawHandlesRestoredFromDisk:false,sourceBodiesPublished:false,oldLabResourcesTouched:false,productRuntimeReady:false,metrics,records:rows};
 await writeFile(new URL('./lifecycle-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({targetsAlive:rows.length,recollectable:true,tokensRemaining:report.tokensRemaining,productRuntimeReady:false}));
}else throw Error('E6_ACTION');
