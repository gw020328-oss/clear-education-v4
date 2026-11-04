// Owner-only transport for the reviewed Moodle route inventory. The public
// front door filters cookies, paths, methods and redirects before/after this.
import {request} from 'node:https';

const check=(ok)=>{if(!ok)throw Error('MOODLE_NATIVE_UPSTREAM');};
export function createNativeMoodleUpstream({origin,connectionPort,ca,signal,
 requestLimit=1024*1024,responseLimit=16*1024*1024,timeoutMs=30000}){
 const u=new URL(origin);
 check(u.origin===origin&&u.protocol==='https:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024
  &&Number.isInteger(connectionPort)&&connectionPort>=1024&&connectionPort<=65535&&ca
  &&[requestLimit,responseLimit,timeoutMs].every(n=>Number.isSafeInteger(n)&&n>0)
  &&requestLimit<=1024*1024&&responseLimit<=16*1024*1024&&timeoutMs<=30000
  &&(signal===undefined||signal instanceof AbortSignal));
 const authority=Buffer.from(ca),active=new Set();let closed=false;
 const close=()=>{if(closed)return;closed=true;for(const cancel of [...active])cancel();
  signal?.removeEventListener('abort',close);};
 signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();
 const handle=async(req,res)=>{
  check(!closed&&req.socket?.encrypted===true&&req.headers.host===u.host
   &&typeof req.url==='string'&&req.url.startsWith('/')&&!req.url.startsWith('//')
   &&!/[\\\x00-\x20\x7f]/.test(req.url)&&['GET','POST'].includes(req.method));
  const length=req.headers['content-length'];
  check(length===undefined||typeof length==='string'&&/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)<=requestLimit);
  await new Promise((resolve,reject)=>{
   let outgoing,incoming,timer,settled=false,sent=0,received=0;
   const finish=(error)=>{
    if(settled)return;settled=true;clearTimeout(timer);active.delete(cancel);
    req.removeListener('aborted',cancel);req.removeListener('error',cancel);req.removeListener('data',countRequest);
    res.removeListener('close',onClose);res.removeListener('finish',onFinish);res.removeListener('error',cancel);
    if(error){req.unpipe(outgoing);incoming?.unpipe(res);outgoing?.destroy();incoming?.destroy();
     if(!req.complete)req.resume();reject(Error('MOODLE_NATIVE_UPSTREAM'));}
    else resolve();
   };
   const cancel=()=>finish(true),onClose=()=>{if(!res.writableFinished)cancel();},onFinish=()=>finish(false);
   const countRequest=chunk=>{sent+=chunk.length;if(sent>requestLimit)cancel();};
   active.add(cancel);req.once('aborted',cancel);req.once('error',cancel);
   res.once('close',onClose);res.once('finish',onFinish);res.once('error',cancel);
   timer=setTimeout(cancel,timeoutMs);timer.unref?.();
   outgoing=request({hostname:'127.0.0.1',port:connectionPort,path:req.url,method:req.method,
    headers:{...req.headers,host:u.host},ca:authority,rejectUnauthorized:true,minVersion:'TLSv1.2',
    agent:false,maxHeaderSize:32768},response=>{
    incoming=response;
    if(settled){response.destroy();return;}
    // Do not follow redirects. The front door checks Location and Set-Cookie.
    try{const size=response.headers['content-length'];
     check(size===undefined||/^(0|[1-9][0-9]*)$/.test(size)&&Number(size)<=responseLimit);
     res.writeHead(response.statusCode,response.headers);
     response.on('data',chunk=>{received+=chunk.length;if(received>responseLimit)cancel();});
     response.once('aborted',cancel);response.once('error',cancel);response.pipe(res);
    }catch{cancel();}
   });
   outgoing.once('error',cancel);req.on('data',countRequest);req.pipe(outgoing);
  });
 };
 return Object.freeze({handle,close});
}

// Only the course entry, login and core resources used by the installed native
// C pages. Private authority endpoints and old CLEAR documents are absent.
export const nativeMoodleRoutes=Object.freeze([
 {path:'/',methods:['GET'],query:[]},
 {path:'/login/index.php',methods:['GET','POST'],query:['testsession','id','sesskey','redirect','loginredirect']},
 {path:'/login/logout.php',methods:['GET','POST'],query:['sesskey']},
 {path:'/my/',methods:['GET'],query:[]},
 {path:'/course/view.php',methods:['GET'],query:['id']},
 ...['index','configure'].map(name=>({path:'/local/clearbridge/'+name+'.php',methods:['GET'],query:['id'],walletDocument:true})),
 {path:'/local/clearbridge/login_action.php',methods:['POST'],query:[]},
 ...['/theme/styles.php','/theme/image.php','/theme/font.php','/lib/javascript.php','/lib/requirejs.php',
  '/lib/polyfills/polyfill.js','/lib/javascript-static.js','/lib/requirejs/require.min.js','/pluginfile.php']
  .map(path=>({path,methods:['GET'],query:['rev','jsfile','theme','type','image','component','lang','file'],slashArguments:true})),
 ...['/lib/ajax/service.php','/lib/ajax/service-nologin.php','/lib/ajax/getnavbranch.php']
  .map(path=>({path,methods:['GET','POST'],query:['sesskey','info']})),
].map(r=>Object.freeze({...r,owner:'C',methods:Object.freeze(r.methods),query:Object.freeze(r.query)})));
