import {fileURLToPath} from 'node:url';
import {compile,createFileManager} from '@noir-lang/noir_wasm';
import {Noir} from '@noir-lang/noir_js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {table,rows} from './fixture.mjs';
import {nativeProgram} from './native-compiler.mjs';
export async function parserProgram({cache=false,compiler='native'}={}){
 if(!['native','wasm'].includes(compiler))throw Error('COMPILER_KIND');
 const source=await readFile(new URL('./circuit/src/main.nr',import.meta.url));
 const sha=createHash('sha256').update(source).update('noir-1.0.0-beta.3-'+compiler).digest('hex');
 const out=new URL('../artifacts/v2/',import.meta.url),file=new URL(sha+'.json',out);
 if(cache){try{return JSON.parse(await readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;}}
 const program=compiler==='native'?await nativeProgram():(await compile(createFileManager(fileURLToPath(new URL('./circuit',import.meta.url))))).program;
 // Program only: never HTML, witness or a live claim. Cache is for local research,
 // not a trusted verification key or a production release manifest.
 await mkdir(out,{recursive:true});await writeFile(file,JSON.stringify(program));return program;
}
export function parserWitness(html=table(),physical=1,fields=rows[0]){
 const bytes=Buffer.from(html);if(bytes.length>2048)throw Error('CIRCUIT_HTML_LIMIT_2048');
 const number=Buffer.from(fields.number);
 if(number.length>10)throw Error('CIRCUIT_NUMBER_CAPACITY');
 return {html:[...bytes,...Array(2048-bytes.length).fill(0)],length:bytes.length,selected_row:physical,
   expected_date:[...Buffer.from(fields.date)],expected_number:[...number,...Array(10-number.length).fill(0)],number_length:number.length,expected_score:Number(fields.score)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const p=await parserProgram();await new Noir(p).execute(parserWitness());
 console.log(JSON.stringify({scope:'PRIVATE_PARSER_COMPONENT_ONLY',witnessPassed:true,htmlCapacity:2048,signatureIntegrated:false,calendarIntegrated:true,duplicateCheckIntegrated:false,productionReady:false}));
}
