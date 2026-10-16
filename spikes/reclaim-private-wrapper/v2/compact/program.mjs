import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';
import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
import {checkCompiler} from '../native-compiler.mjs';
import {parserWitness} from '../parser-circuit.mjs';
import {table,rows} from '../fixture.mjs';
const exec=promisify(execFile);
export const out=new URL('../../artifacts/compact/',import.meta.url);
export async function program({cache=false,variant='compact'}={}){
 const files={compact:'./main.nr',field:'../field-code/main.nr'};
 if(!Object.hasOwn(files,variant))throw Error('UNKNOWN_RESEARCH_VARIANT');
 const source=await readFile(new URL(files[variant],import.meta.url));
 const digest=createHash('sha256').update(source).digest('hex');
 await mkdir(out,{recursive:true});const artifact=new URL(digest+'.json',out);
 if(cache){try{return JSON.parse(await readFile(artifact));}catch(e){if(e.code!=='ENOENT')throw e;}}
 await checkCompiler();const work=await mkdtemp(fileURLToPath(new URL('compile-',out)));
 try{
  await mkdir(work+'/src');await writeFile(work+'/src/main.nr',source);
  await writeFile(work+'/Nargo.toml','[package]\nname="compact_parser"\ntype="bin"\nauthors=[]\n[dependencies]\n');
  await exec(fileURLToPath(new URL('../../../../.toolchain/wrapper-v2-nargo/nargo',import.meta.url)),['compile','--program-dir',work],{timeout:300000,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin'}});
  const result=JSON.parse(await readFile(work+'/target/compact_parser.json'));await writeFile(artifact,JSON.stringify(result));return result;
 }finally{await rm(work,{recursive:true,force:true});}
}
// Untrusted witness hints only. The circuit validates their cell containment,
// byte matches and every skipped byte. This helper is not a source validator.
export function witness(html=table(),physical=1,fields=rows[0]){
 const w=parserWitness(html,physical,fields);
 const matches=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)],row=matches[physical];
 const cells=row?[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)]:[];
 const starts=[],ends=[];let weekday=[236,157,188];
 for(let j=0;j<4;j++){
  const cell=cells[j];if(!cell){starts.push(0);ends.push(0);continue;}
  const raw=cell[1],leading=/^[\t\r\n ]*/.exec(raw)[0].length,trailing=/[\t\r\n ]*$/.exec(raw)[0].length;
  const begin=row.index+row[0].indexOf('>')+1+cell.index+cell[0].indexOf('>')+1;
  starts.push(Buffer.byteLength(html.slice(0,begin+leading)));ends.push(Buffer.byteLength(html.slice(0,begin+raw.length-trailing)));
  if(j===1)weekday=[...Buffer.from(raw.trim().slice(11,12))];
 }
 return {...w,trim_starts:starts,trim_ends:ends,weekday};
}
