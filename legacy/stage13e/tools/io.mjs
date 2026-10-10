import fs from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const project=fileURLToPath(new URL('../../',import.meta.url)),stage=resolve(project,'stage13e');
export const need=(ok,code)=>{if(!ok)throw new Error(code);};
export const encode=x=>JSON.stringify(x,null,2)+'\n';
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const bytes=p=>fs.readFileSync(resolve(project,p));
export const text=p=>bytes(p).toString('utf8');
export const read=p=>JSON.parse(text(p));
export const fileSha=p=>sha(bytes(p));
export function target(p){const t=resolve(stage,p);need(t.startsWith(stage+'/'),'OUTPUT_SCOPE');return t;}
export const exists=p=>fs.existsSync(target(p));
// Atomic, create-only generated artifacts; no overwrite and all temp files stay in 13E.
let serial=0;
export function save(p,value){
 const out=target(p);fs.mkdirSync(dirname(out),{recursive:true});need(!fs.existsSync(out),'IMMUTABLE_OUTPUT_EXISTS');
 const tmp=out+'.tmp-'+process.pid+'-'+serial++,data=Buffer.isBuffer(value)?value:typeof value==='string'?value:encode(value);
 const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.linkSync(tmp,out);fs.unlinkSync(tmp);
}
export function listFiles(dir=project){const found=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const t=resolve(p,e.name);if(e.isDirectory())walk(t);else if(e.isFile()||e.isSymbolicLink()&&fs.statSync(t).isFile())found.push(t.slice(project.length));}}walk(dir);return found.sort();}
export function integrity(){const prior=read('stage13e/artifacts/prior-files.json');const changed=[];
 for(const e of prior.entries){const p=resolve(project,e.path);try{const stat=fs.lstatSync(p);if(e.type==='file'){if(!stat.isFile()||fileSha(e.path)!==e.bytesSha256)changed.push(e.path);}else{if(!stat.isSymbolicLink()||sha(Buffer.from(fs.readlinkSync(p)))!==e.linkBytesSha256||e.targetBytesSha256!==null&&fileSha(e.path)!==e.targetBytesSha256)changed.push(e.path);}}catch{changed.push(e.path);}}
 const extras=listFiles().filter(p=>!p.startsWith('stage13e/')&&!Object.hasOwn(prior.files,p));
 return {passed:changed.length===0&&extras.length===0,checkedFiles:Object.keys(prior.files).length,checkedLinks:Object.keys(prior.symlinks).length,changed,newFilesOutsideStage13e:extras};
}
export function manifestCheck(p){const entries=text(p).trim().split('\n').map(l=>{const n=l.indexOf('  ');return {sha256:l.slice(0,n),path:l.slice(n+2)};});need(entries.every(e=>fileSha(e.path)===e.sha256),'LOCK_HASH_MISMATCH');return entries;}
export const jsonl=p=>text(p).trim().split('\n').map(l=>JSON.parse(l));
