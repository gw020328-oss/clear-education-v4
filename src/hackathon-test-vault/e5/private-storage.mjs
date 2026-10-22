import {constants,openSync,closeSync,writeFileSync,readFileSync,fsyncSync,renameSync,linkSync,lstatSync,mkdirSync,realpathSync,unlinkSync} from 'node:fs';
import {canonical} from '../../policy/values.mjs';
import {dirname,join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
export const ensure=(ok,code)=>{if(!ok)throw new Error(code);};
export const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
export const sha=value=>'0x'+createHash('sha256').update(typeof value==='string'?value:canonical(JSON.parse(json(value)))).digest('hex');
export function privateDirectory(path,{create=false}={}){
 path=resolve(path);if(create){try{mkdirSync(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}}
 const s=lstatSync(path);ensure(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'E5_PRIVATE_DIRECTORY');
 ensure(realpathSync(path)===path,'E5_PRIVATE_DIRECTORY_ALIAS');return path;
}
export function privateFile(path){const s=lstatSync(path);ensure(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o077)===0,'E5_PRIVATE_FILE');return s;}
export function readPrivate(path){privateDirectory(dirname(path));privateFile(path);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{return readFileSync(fd,'utf8');}finally{closeSync(fd);}}
export function syncDirectory(path){const fd=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function atomicPrivate(path,value,{exclusive=false}={}){
 const parent=privateDirectory(dirname(path));let exists=false;
 try{privateFile(path);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 ensure(!exclusive||!exists,'E5_ALREADY_EXISTS');const temp=join(parent,'.write-'+randomUUID());let fd;
 try{fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,typeof value==='string'?value:json(value));fsyncSync(fd);closeSync(fd);fd=undefined;if(exclusive){linkSync(temp,path);unlinkSync(temp);}else renameSync(temp,path);syncDirectory(parent);}
 finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
