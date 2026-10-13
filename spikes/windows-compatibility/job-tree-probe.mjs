import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
await writeFile(process.argv[2],JSON.stringify({spawned:true}),{flag:'wx'});
setInterval(()=>{},1000);
