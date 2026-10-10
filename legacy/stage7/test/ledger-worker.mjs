import { readFileSync } from 'node:fs';
import { CentralEscrow } from '../lib/central.mjs';
const [db,manifestFile,evidenceFile,time]=process.argv.slice(2);
const m=JSON.parse(readFileSync(manifestFile)),p=JSON.parse(readFileSync(evidenceFile)),e=new CentralEscrow(db,m);
process.send?.({type:'ready'});
process.on('message',msg=>{if(msg==='claim'){try{e.claim(p,p.recipient,Number(time));process.send?.({success:true})}catch(err){process.send?.({success:false,code:err.code})}finally{e.close();process.exit(0)}}});
