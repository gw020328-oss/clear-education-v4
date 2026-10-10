import fs from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const project=fileURLToPath(new URL('../../',import.meta.url)),root=resolve(project,'stage14');
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const encode=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
export const read=p=>JSON.parse(fs.readFileSync(resolve(root,p),'utf8'));
export function save(p,x){const target=resolve(root,p);if(!target.startsWith(root+'/'))throw Error('OUTPUT_SCOPE');fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,typeof x==='string'||Buffer.isBuffer(x)?x:encode(x),{flag:'wx',mode:0o600});}
export function walk(dir=project){const entries=[];for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,d.name);if(p===root)continue;if(d.isDirectory())entries.push(...walk(p));else if(d.isSymbolicLink())entries.push({path:p.slice(project.length),type:'symlink',link:fs.readlinkSync(p),hash:sha(fs.readFileSync(p))});else if(d.isFile())entries.push({path:p.slice(project.length),type:'file',hash:sha(fs.readFileSync(p))});}return entries.sort((a,b)=>a.path.localeCompare(b.path));}
export const safeCode=e=>/^[A-Z0-9_:-]+$/.test(e?.code??e?.message??'')?(e.code??e.message):'INTERNAL_ERROR_DETAILS_SUPPRESSED';
