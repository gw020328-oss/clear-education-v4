// No browser, public network, Reclaim generation, disk writes or real credential input.
import net from 'node:net';
import { createECDH, randomBytes } from 'node:crypto';
const owner=createECDH('secp256k1');owner.generateKeys();
const cookie=randomBytes(32);let socket,ended=false,busy=false,buffer='',completed=0,loggedIn=false,timer;
const emit = value => process.send?.(value);
function end(status) {
 if(ended)return;ended=true;clearTimeout(timer);cookie.fill(0);socket?.destroy();
 emit({status});process.disconnect(); // owner memory is reclaimed by process exit; no zeroization claim.
}
process.on('message',msg=>{
 if(ended)return;
 if(msg.type==='start') {
   if(socket || msg.mode!=='SYNTHETIC'||!Number.isInteger(msg.port)||msg.port<1||msg.port>65535) return end('REJECTED');
   socket=net.createConnection({host:'127.0.0.1',port:msg.port});
   timer=setTimeout(()=>end('EXPIRED'),msg.ttlMs);timer.unref();
   socket.on('error',()=>end('RETRY_REQUIRED'));socket.on('close',()=>end('RETRY_REQUIRED'));
   socket.on('connect',()=>{emit({status:'READY',pid:process.pid,ownerPublicKey:owner.getPublicKey('hex','uncompressed')});});
   socket.on('data',chunk=>{
     buffer+=chunk.toString();if(buffer.length>4096)return end('REJECTED');
     let idx;while((idx=buffer.indexOf('\n'))>=0){
       const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);let data;
       try{data=JSON.parse(line);}catch{return end('REJECTED');}
       if(!busy)return end('REJECTED');busy=false;
       if(!loggedIn){loggedIn=true;emit({status:'LOGGED_IN',connectionId:data.connectionId});}
       else{completed++;emit({status:completed===1?'PARTIAL':'PAIR_READY_SYNTHETIC',connectionId:data.connectionId,paymentAllowed:false});}
     }
   });
 } else if(msg.type==='cancel')end('CANCELLED');
 else if(msg.type==='complete')end('CLOSED');
 else if(msg.type==='login'||msg.type==='proof') {
   if(!socket||socket.destroyed||busy|| (msg.type==='proof'&&(!loggedIn||completed>=2)) || (msg.type==='login'&&loggedIn))return end('REJECTED');
   busy=true;socket.write(JSON.stringify({type:msg.type,syntheticCookie:cookie.toString('hex')})+'\n');
 }else end('REJECTED');
});
process.on('disconnect',()=>{cookie.fill(0);socket?.destroy();process.exit(0);});
