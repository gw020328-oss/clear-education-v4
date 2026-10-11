// Read-only diagnostic. No production authorization API and no privileged mutations.
import {promises as fs} from 'node:fs';
import {resolve,relative,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const unescapeMount=s=>s.replace(/\\(040|011|012|134)/g,(_,oct)=>String.fromCharCode(parseInt(oct,8)));
export function parseMountInfo(text) {
 return text.trim().split('\n').filter(Boolean).map(line=>{
  const halves=line.split(' - '),left=halves[0]?.split(' '),right=halves[1]?.split(' ');
  if(halves.length!==2||left.length<6||right.length<3)throw new Error('MOUNTINFO');
  return {root:unescapeMount(left[3]),target:unescapeMount(left[4]),type:right[0],options:[...new Set([...left[5].split(','),...right[2].split(',')])]};
 });
}
const contained=(root,path)=>path===root||path.startsWith(root+sep);
export function enclosingMount(mounts,path) {return mounts.filter(m=>contained(m.target==='/'?'':m.target,path)).sort((a,b)=>b.target.length-a.target.length)[0]??null;}
export function cgroupSwapFile(mounts,cgroupText) {
 const line=cgroupText.split('\n').find(s=>s.startsWith('0::'));if(!line)return null;
 const path=line.slice(3);if(!path.startsWith('/')||path.split('/').includes('..'))return null;
 const match=mounts.filter(m=>m.type==='cgroup2'&&contained(m.root==='/'?'':m.root,path)).sort((a,b)=>b.root.length-a.root.length)[0];
 if(!match)return null;
 return join(match.target,relative(match.root,path),'memory.swap.max');
}
const readText=async path=>{try{return await fs.readFile(path,'utf8');}catch{return null;}};
export async function observe(target,role) {
 if(!['collector','verifier'].includes(role))throw new Error('ROLE');
 const spec=target[role],root=resolve(spec.root),paths=[root,...spec.children.map(name=>join(root,name))];
 if(spec.root!==root||root!==`/run/clear-${role}`||spec.children.some(n=>!/^[a-z][a-z-]*$/.test(n)))throw new Error('TARGET_PATH');
 const s={schemaVersion:4,observedAt:new Date().toISOString(),role,root,platform:process.platform,node:process.versions.node,uid:process.getuid?.()??null,paths:[],globalSwapDisabled:null,cgroupSwapMaxZero:null,coreDumpDisabled:null,noNewPrivileges:null,source:'LOCAL_READ_ONLY_PROCESS_OBSERVATION'};
 let mounts=[];
 if(s.platform==='linux') {
   const mountText=await readText('/proc/self/mountinfo');if(mountText!==null){try{mounts=parseMountInfo(mountText);}catch{}}
   const swaps=await readText('/proc/swaps');if(swaps!==null)s.globalSwapDisabled=swaps.trim().split('\n').length===1;
   const cg=await readText('/proc/self/cgroup');const cgf=cg===null?null:cgroupSwapFile(mounts,cg);
   const cgValue=cgf?await readText(cgf):null;if(cgValue!==null)s.cgroupSwapMaxZero=cgValue.trim()==='0';
   const limits=await readText('/proc/self/limits');if(limits!==null)s.coreDumpDisabled=/^Max core file size\s+0\s+0\s+bytes[ \t]*$/m.test(limits);
   const status=await readText('/proc/self/status');if(status!==null)s.noNewPrivileges=/^NoNewPrivs:\s+1$/m.test(status);
 }
 for(const path of paths) {
   const p={path,exists:false,directory:false,symlinkFree:false,ownerMatches:false,privateMode:false,tmpfs:false,mount:null};
   try {
     const st=await fs.lstat(path);p.exists=true;p.directory=st.isDirectory();p.symlinkFree=!st.isSymbolicLink()&&await fs.realpath(path)===path;p.ownerMatches=st.uid===s.uid;p.privateMode=(st.mode&0o777)===0o700;
     const stat=await fs.statfs(path);p.tmpfs=Number(stat.type)===0x01021994;p.mount=enclosingMount(mounts,path);
   }catch{}
   s.paths.push(p);
 }
 return s;
}
export function evaluate(snapshot,target,role) {
 const failures=[];const check=(value,id)=>{if(value!==true)failures.push(id);};
 check(snapshot.platform==='linux','LINUX_REQUIRED');check(snapshot.node===target.requiredNodeVersion,'PINNED_NODE_REQUIRED');
 check(Number.isInteger(snapshot.uid)&&snapshot.uid>0,'NON_ROOT_REQUIRED');check(snapshot.role===role&&snapshot.root===target[role].root,'ROLE_ROOT');
 check(snapshot.coreDumpDisabled,'CORE_DUMP_DISABLED');check(snapshot.noNewPrivileges,'NO_NEW_PRIVILEGES');
 const expected=[target[role].root,...target[role].children.map(n=>join(target[role].root,n))];
 check(snapshot.paths.length===expected.length&&new Set(snapshot.paths.map(p=>p.path)).size===expected.length,'EXACT_PATH_SET');
 for(const path of expected) {
   const p=snapshot.paths.find(p=>p.path===path),key=relative(target[role].root,path)||'root';
   check(!!p&&p.exists&&p.directory&&p.symlinkFree&&p.ownerMatches&&p.privateMode,`PRIVATE_PATH:${key}`);
   check(!!p&&p.tmpfs&&p.mount?.type==='tmpfs',`TMPFS:${key}`);
   check(!!p&&target[role].mountOptions.every(flag=>p.mount?.options.includes(flag)),`MOUNT_FLAGS:${key}`);
   // Conservative project gate; kernel scope only, never sufficient for a VM host or browser audit.
   check(snapshot.globalSwapDisabled===true||(snapshot.cgroupSwapMaxZero===true&&p?.mount?.options.includes('noswap')),`SWAP_BOUNDARY:${key}`);
 }
 return {status:failures.length?'LOCAL_PREFLIGHT_BLOCKED':'LOCAL_KERNEL_CHECKS_PASS_EXTERNAL_REVIEW_REQUIRED',role,failures,kernelPreflightPassed:failures.length===0,mayGenerateRealProof:false,paymentAllowed:false,externalReviewRequired:[...target.externalReviewRequired],scope:'CURRENT_PROCESS_AND_DECLARED_PATHS_ONLY_NOT_BROWSER_OR_HOST_ATTESTATION'};
}
export async function inspect(role) {const target=JSON.parse(await fs.readFile(new URL('./targets.candidate.json',import.meta.url),'utf8'));const snapshot=await observe(target,role);return {snapshot,result:evaluate(snapshot,target,role)};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const report=await inspect(process.argv[2]);console.log(JSON.stringify(report,null,2));process.exitCode=report.result.kernelPreflightPassed?0:2;}
 catch {console.log(JSON.stringify({status:'PREFLIGHT_INPUT_OR_READ_FAILURE',mayGenerateRealProof:false}));process.exitCode=2;}
}
