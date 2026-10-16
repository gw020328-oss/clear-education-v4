// Public synthetic fault injection; never a production worker target.
import './offline.mjs';import net from 'node:net';
process.once('message',input=>{
 if(input.behavior==='hang'){setInterval(()=>{},1000);return;}
 if(input.behavior==='crash'){console.error('PUBLIC_SYNTHETIC_PRIVATE_MARKER');process.exit(2);}
 if(input.behavior==='network'){
  try{net.connect(80,'127.0.0.1');process.exit(3);}catch{process.send({ok:false},()=>process.exit(1));}return;
 }
 process.send({ok:true,result:{source:'PUBLIC_SYNTHETIC_PRIVATE_MARKER'}},()=>process.exit(0));
});
