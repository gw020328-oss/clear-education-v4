// Emits an inspectable plan only. Does not mount, install, launch a browser or accept real credentials.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function buildPlan(target,role,mode='SYNTHETIC') {
 if(!['collector','verifier'].includes(role)||mode!=='SYNTHETIC'||target.mayGenerateRealProof!==false)throw new Error('SYNTHETIC_PREPARATION_ONLY');
 const s=target[role];
 if(s.root!==`/run/clear-${role}`)throw new Error('ROOT');
 const plan={role,mode,status:'REVIEWABLE_PLAN_NOT_INSTALLED',targetSelected:false,mayGenerateRealProof:false,paymentAllowed:false,root:s.root,paths:s.children.map(n=>`${s.root}/${n}`),candidateMemoryMiB:s.memorySizeCandidateMiB,capacityMeasured:false,requiredNodeVersion:target.requiredNodeVersion,
 controls:{nonRoot:true,readOnlyRoot:true,capabilities:[],noNewPrivileges:true,coreSoftLimit:0,coreHardLimit:0,swap:'GLOBAL_DISABLED_OR_REVIEWED_NOSWAP_AND_CGROUP_ZERO',backup:'MUST_VERIFY_HOST_AND_GUEST_EXCLUSION',snapshots:'MUST_VERIFY_NO_MEMORY_SNAPSHOT',logs:'BOUNDED_ALLOWLIST_METADATA_ONLY_NO_STDOUT_PAYLOAD',network:'SYNTHETIC_LOOPBACK_ONLY',browserSandboxMustRemainEnabled:true},
 startup:['Confirm selected physical/VM host and current review evidence','Create fresh bounded volatile mount; never reuse nonempty existing directory','Verify mount owner, mode, nested mounts, swap, dump and exact runtime','Create owned per-session child paths with mode 0700','Recheck immediately before launch; refuse missing/unknown facts'],
 shutdown:['Stop descendants and transport first','Revoke session and discard cookie/owner; no automatic reconnect','Delete session staging; unmount only this run owned mount','Fail closed on cleanup error and report only an error code'],
 blockers:[...target.externalReviewRequired]};
 if(role==='collector') {
  plan.browser={binary:'UNSELECTED_LINUX_CHROME_BUILD',syntheticStartUrl:'about:blank',args:[`--user-data-dir=${s.root}/profile`,`--disk-cache-dir=${s.root}/cache`,'--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-sync','--disable-extensions','--disable-background-networking','--disable-component-update'],env:{TMPDIR:`${s.root}/temp`,XDG_CONFIG_HOME:`${s.root}/xdg-config`,XDG_CACHE_HOME:`${s.root}/xdg-cache`,XDG_DATA_HOME:`${s.root}/xdg-data`,XDG_STATE_HOME:`${s.root}/xdg-state`,XDG_RUNTIME_DIR:`${s.root}/xdg-runtime`},downloadPolicy:'BLOCK_UNLESS_EXPLICITLY_REVIEWED',crashPolicy:'VERIFY_ALL_DESCENDANT_PATHS_AND_NO_UPLOAD_NOT_FLAG_ONLY',display:'UNDECIDED_USER_INTERACTIVE_PATH_REQUIRED_BEFORE_LOGIN'};
 } else plan.verifier={rawProofPath:`${s.root}/raw-proof`,tempPath:`${s.root}/temp`,retentionSeconds:s.rawProofMaxRetentionSeconds,deleteOnPacketIssued:true,restart:'Raw data loss allowed; fresh proof required within fixed deadline',packetAndLedger:'Persist separately with existing rights and 30-day policy; never delete them with raw-proof mount',transport:'AUTHENTICATED_HTTPS_NOT_IMPLEMENTED'};
 return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const target=JSON.parse(await readFile(new URL('./targets.candidate.json',import.meta.url),'utf8'));
 try{console.log(JSON.stringify(buildPlan(target,process.argv[2],process.argv[3]??'SYNTHETIC'),null,2));}catch{console.log(JSON.stringify({status:'SYNTHETIC_PREPARATION_ONLY',mayGenerateRealProof:false}));process.exitCode=2;}
}
