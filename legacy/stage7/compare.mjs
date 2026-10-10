import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Wallet } from 'ethers';
import { performance } from 'node:perf_hooks';
import { fixture } from './lib/fixture.mjs';
import { centralClaim,onchainClaim } from './lib/clients.mjs';
import { jsonFile,sha,reachable } from './lib/process.mjs';
const root=fileURLToPath(new URL('./',import.meta.url)),out=join(root,'artifacts');
await mkdir(out,{recursive:true});
const protocolHash=sha(await readFile(join(root,'COMPARISON_PROTOCOL.md')));
const scenarios=[
 ['normal',true,true],['main-down',true,true],['issuer-down',true,true],['both-down',true,true],
 ['executor-down',false,true],['chain-down',true,false],['ui-down',true,true],
 ['missing',false,false],['false-attestation',true,true],['forged',false,false],['duplicate',false,false],
 ['other-recipient',false,false],['expired',false,false],['concurrent-replay',true,true],['restart',true,true],
 ['underfunded',false,false],['no-gas',true,false]
];
function properties(rail,scenario){
  const chain=rail==='onchain';
  return {
    additionalThirdPartyApprovalRequired:false,approvalEvidence:'자동 검증 후 지급 코드, 실행자 decision IPC; 새 issuer/학교 승인 요청 없음(전체 네트워크 계측 아님)',
    necessaryComponents:chain?['saved evidence','trusted manifest','claim client','signing wallet','gas','chain','honest RPC','fixed TEST token']:['saved evidence','trusted manifest (executor stored)','claim client','independent executor','persistent ledger','executor clock'],
    claimAccountRequired:false,claimWalletRequired:chain,registrationSignatureRequiredForBoth:true,gasRequired:chain,chainRpcRequired:chain,
    userRecovery:chain?(scenario==='chain-down'?'제공된 모든 체인/RPC 중단: 사용자만으로 복구 불가; 실행 계층 복구 필요':scenario==='no-gas'?'가스를 확보하거나 가스 보유 제삼자 전달 지갑 사용':'보관 파일로 별도 CLI·정직한 동일 체인 RPC·다른 가스 보유 전달 지갑 사용'):(scenario==='executor-down'?'원장 쓰기 권한 없는 사용자는 실행자 복구 필요; CLI도 동일 실행자에 의존':'독립 실행자 API 또는 CLI에 파일 직접 제출; 원장 장애 복구는 운영자'),
    changeStopRecoveryAuthority:chain?'금고 조건·토큰 동결 관리자 없음; sponsor는 만료 후만 반환; 로컬 Ganache 운영자는 테스트 체인을 정지·조작 가능':'독립 운영자가 서버·DB·지급 코드를 통제; 정상 API는 임의 지급 변경·조기 반환을 제공하지 않음',
    addedRight:chain?'중앙 지급 실행자의 새 승인 없이 고정 조건을 집행; 체인·RPC 정상 전제':'학교의 새 승인 없이 독립 준비금에서 자동 집행',
    addedResponsibility:chain?'파일·수령키·전달지갑·가스·RPC·기한·신뢰 manifest 관리, 고정 오류 복구 한계':'파일·기한 관리 및 실행자·원장 운영 신뢰',
    uiActionsMeasured:null,userActionBasis:'완료된 호출 결과 수로 집계한 자동 CLI/API 청구 호출 수; 실제 사용자 행동·사용성 아님'
  };
}
async function cli(f,rail){
  const start=performance.now(),args=[join(root,'cli.mjs'),rail,rail==='central'?f.centralUrl:f.chainUrl,f.evidencePath];
  if(rail==='onchain')args.push(f.manifestPath);
  const child=spawn(process.execPath,args,{env:{...process.env,...(rail==='onchain'?{SUBMITTER_KEY:f.relayer.privateKey}:{})},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  await new Promise(resolve=>child.once('exit',resolve));f.extraLogs??=[];f.extraLogs.push(stdout,stderr);
  const result=JSON.parse(stdout.trim());return {...result,cliProcessElapsedMs:performance.now()-start,alternativeCliUsed:true};
}
const results=[];
for(const [id,centralExpected,onchainExpected] of scenarios){
  const f=await fixture({underfunded:id==='underfunded'});let row;
  try{
    const before={central:f.centralState(),onchain:await f.chainState()};
    if(id==='main-down'||id==='both-down')await f.stop('main');
    if(id==='issuer-down'||id==='both-down')await f.stop('issuerService');
    if(id==='executor-down')await f.stop('executor');
    if(id==='chain-down')await f.stop('chain');
    if(id==='ui-down'){await f.stop('centralUI');await f.stop('onchainUI');}
    if(id==='restart'){await f.stop('executor');await f.startExecutor();}
    if(id==='expired')await f.setTime(f.manifest.terms.claimUntil+1);
    const packet=structuredClone(f.packet);
    if(id==='missing')packet.submissions.pop();
    if(id==='forged')packet.submissions[0].signature=packet.acceptance.signature;
    if(id==='duplicate')packet.submissions[3]=structuredClone(packet.submissions[0]);
    if(id==='other-recipient')packet.recipient=Wallet.createRandom().address;
    const text=JSON.stringify(packet);await writeFile(f.evidencePath,text,{mode:0o600});
    await mkdir(join(out,'inputs',id),{recursive:true});await writeFile(join(out,'inputs',id,'evidence.json'),text,{mode:0o600});await jsonFile(join(out,'inputs',id,'manifest.json'),f.manifest);
    const signer=id==='no-gas'?Wallet.createRandom().connect(f.provider):id==='chain-down'?f.relayer.connect(f.provider):await f.provider.getSigner(f.relayer.address);
    let central,onchain;
    // Never ask stopped chain for a signer: relay key is already held in this test process.
    if(id==='ui-down'){central=await cli(f,'central');onchain=await cli(f,'onchain');}
    else if(id==='concurrent-replay'){
      const centralAttempts=await Promise.all([centralClaim(f.centralUrl,packet),centralClaim(f.centralUrl,packet)]);
      const signers=[signer,await f.provider.getSigner(f.sponsor.address)];
      const onchainAttempts=await Promise.all(signers.map(s=>onchainClaim(f.provider,f.manifest,packet,s,{rawRace:true})));
      central={...centralAttempts.find(a=>a.success),attempts:[...centralAttempts,await centralClaim(f.centralUrl,packet)]};
      onchain={...onchainAttempts.find(a=>a.success),attempts:[...onchainAttempts,await onchainClaim(f.provider,f.manifest,packet,signer)]};
    }else{
      central=await centralClaim(f.centralUrl,packet);
      onchain=await onchainClaim(f.provider,f.manifest,packet,signer);
      if(id==='restart'){central.replay=await centralClaim(f.centralUrl,packet);onchain.replay=await onchainClaim(f.provider,f.manifest,packet,signer);}
    }
    const after={central:f.centralState(),onchain:id==='chain-down'?null:await f.chainState()};
    const failed=id==='main-down'?['main']:id==='issuer-down'?['issuer']:id==='both-down'?['main','issuer']:id==='executor-down'?['central executor']:id==='chain-down'?['chain','all provided RPC']:id==='ui-down'?['central UI','onchain UI']:id==='no-gas'?['onchain gas']:id==='underfunded'?['enrollment reserve funding']:centralExpected?[]:['evidence or deadline validation'];
    row={id,expected:{central:centralExpected,onchain:onchainExpected},time:f.time,evidenceSha256:sha(text),identicalBytesToBoth:true,actualSubmissionFact:id==='false-attestation'?false:null,failedComponents:failed,processStops:f.stops,enrollment:f.enrollmentResult,
      central:{...central,...properties('central',id),reserveBefore:before.central,reserveAfter:{...after.central,observation:id==='executor-down'?'offline read of test ledger after process exit':'persisted ledger read'},duplicatePaid:BigInt(after.central.paidUnits)>50000000n},
      onchain:{...onchain,...properties('onchain',id),reserveBefore:before.onchain,reserveAfter:after.onchain?{...after.onchain,observation:'live verified chain'}:{observation:'unavailable after chain stop; last observed value is reserveBefore'},duplicatePaid:after.onchain?BigInt(after.onchain.paidUnits)>50000000n:null},
      protocolMatch:central.success===centralExpected&&onchain.success===onchainExpected
    };
    if(row.central.duplicatePaid||row.onchain.duplicatePaid)row.protocolMatch=false;
    if(id==='concurrent-replay'&&[central,onchain].some(v=>v.attempts.filter(a=>a.success).length!==1))row.protocolMatch=false;
    if(id==='restart'&&(central.replay.success||onchain.replay.success))row.protocolMatch=false;
    row.centralExecutorDecisions=f.executor.messages.filter(m=>m.type==='decision');
    for(const rail of ['central','onchain'])row[rail].userActionCount=row[rail].attempts?.length??(row[rail].replay?2:1);
    row.savedInputs={evidence:'inputs/'+id+'/evidence.json',manifest:'inputs/'+id+'/manifest.json'};
    row.temporaryStorage=f.dir;
    row.clockEvidence={centralClockFileSeconds:Number(await readFile(f.clockPath,'utf8')),chainBlockSeconds:after.onchain?.observedBlockTime??null,chainUnavailable:id==='chain-down'};
    await jsonFile(join(out,id+'.json'),row);
  }finally{
    const audit=await f.close();if(row){row.secretAudit=audit;const outputs=[JSON.stringify(row),...(f.extraLogs??[])];for(const log of outputs)for(const key of [f.sponsor.privateKey,f.learner.privateKey,f.issuer.privateKey,f.relayer.privateKey])if(log.toLowerCase().includes(key.slice(2).toLowerCase()))audit.exactGeneratedSecretMatches++;audit.additionalOutputsScanned=outputs.length;}
  }
  results.push(row);console.log(id+': central='+row.central.success+' onchain='+row.onchain.success+' match='+row.protocolMatch);
  await jsonFile(join(out,id+'.json'),row);
}
const summary={scenarios:results.length,protocolMatches:results.filter(r=>r.protocolMatch).length,centralSuccess:results.filter(r=>r.central.success).length,onchainSuccess:results.filter(r=>r.onchain.success).length,centralFailure:results.filter(r=>!r.central.success).length,onchainFailure:results.filter(r=>!r.onchain.success).length,secretMatches:results.reduce((n,r)=>n+r.secretAudit.exactGeneratedSecretMatches,0)};
await jsonFile(join(out,'comparison-results.json'),{protocolSha256:protocolHash,completedAt:new Date().toISOString(),measurement:'local automatic client request -> confirmed result; no real users',actualUsers:0,summary,results});
if(summary.protocolMatches!==scenarios.length||summary.secretMatches!==0)process.exitCode=1;
