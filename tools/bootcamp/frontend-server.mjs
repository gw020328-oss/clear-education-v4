import {createHash} from 'node:crypto';
import {validateConfig} from '../../src/embedded-wallet/config.mjs';
import {createMoodleFrontDoor,createMoodleFrontDoorPolicy,moodleNativeApplicationRoutes,moodleActivityRefreshRoute} from './moodle-front-door.mjs';
import {createMoodleOAuthReturn} from './moodle-oauth-return.mjs';
import {createProductRpc} from '../embedded-wallet/product-rpc.mjs';
import {productWalletMount} from '../embedded-wallet/product-mount.mjs';
import {existsSync,readFileSync} from 'node:fs';
import {createApplicationServer} from '../../src/application/http.mjs';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {NORMAL_HOST_VERSION} from '../../src/bootcamp/normal-client.mjs';

// Mount the existing two handlers on one existing HTTPS server; no RPC, collector or signer is installed.
export function createBootcampFrontendServer({authentication,store,tls,sourceMode,chainId,webRoot,normalUi=null,network=null,moodleLogin=null,moodleNative=null}){
 if(normalUi&&sourceMode!=='REGISTERED_TEST_SOURCE')throw Error('BC_FRONTEND_CONFIG');
 if(moodleLogin&&!normalUi)throw Error('MOODLE_LOGIN_WALLET_MOUNT');
 if(authentication.origin!==store.origin||authentication.chainId!==chainId||!tls||!['SYNTHETIC_TEST_SOURCE','REGISTERED_TEST_SOURCE'].includes(sourceMode))throw Error('BC_FRONTEND_CONFIG');
 let walletNetwork=null;
 if(network){const u=new URL(network.rpcUrl);if(sourceMode!=='REGISTERED_TEST_SOURCE'||!normalUi||network.chainId!==chainId||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('BC_FRONTEND_NETWORK');
  walletNetwork=Object.freeze({chainId:'0x'+BigInt(chainId).toString(16),chainName:'CLEAR Local TEST',rpcUrls:[u.origin],nativeCurrency:{name:'Local test Ether',symbol:'ETH',decimals:18}});}
 const server=createApplicationServer(authentication,{tls,completeMoodleLogin:moodleLogin?.complete}),auth=server.listeners('request')[0],bootcamp=createBootcampHandler(store,{normalUi});
 const expected=new URL(store.origin),assets=webRoot&&existsSync(webRoot)?loadPublicAssets(webRoot):new Map();
 assets.set('/bootcamp-normal-client.mjs',{type:'text/javascript; charset=utf-8',body:readFileSync(new URL('../../src/bootcamp/normal-client.mjs',import.meta.url))});
 let rpc=null;
 if(assets.has('/clear-wallet-app.html')){
  if(!walletNetwork||!normalUi?.walletRuntime)throw Error('EMBEDDED_PRODUCT_RUNTIME');
  productWalletMount({assets,origin:store.origin,chainId,network:walletNetwork,runtime:normalUi.walletRuntime});
  walletNetwork=Object.freeze({...walletNetwork,rpcUrls:['http://127.0.0.1:'+(Number(new URL(store.origin).port)+2)]});
 }
 const wallets=productWalletMount({assets,origin:store.origin,chainId,network:walletNetwork,runtime:normalUi?.walletRuntime,moodleLogin:!!moodleLogin});
 if(moodleLogin&&!wallets)throw Error('MOODLE_LOGIN_WALLET_MOUNT');
 const native=prepareNative({options:moodleNative,assets,wallets,moodleLogin,origin:store.origin,activityPageId:normalUi?.activityPageId});
 const config=Object.freeze({version:NORMAL_HOST_VERSION,origin:store.origin,chainId,sourceMode,network:walletNetwork,phase:normalUi?'ACTIVE_LOCAL_TEST':'DISPLAY_ONLY',policyHash:p0PolicyHash(P0_POLICY),
  procedureHttpVersion:'clear-bootcamp-review-procedure.1',operationsHttpVersion:'clear-bootcamp-operations-projection.2',
  reviewConsentHttpImplemented:true,originalEvidenceHttpImplemented:false,executionReceiptHttpImplemented:typeof normalUi?.getPaymentReceipt==='function',
  sourceCollectionConfigured:normalUi!==null,sourceSignatureHttpImplemented:normalUi!==null,signerInstalled:false,actualSourceVerification:null,productionEnabled:false});
 server.removeListener('request',auth);const pending=new Set();
 const handle=async(req,res)=>{
  if(moodleLogin?.matches(req.url))return moodleLogin.handle(req,res);
  if(/^\/bootcamp(?:\/|\?|$)/.test(req.url)){
   const allowed=req.method==='GET'&&(/^\/bootcamp\/v[23]\/applications\/[a-z][a-z0-9.-]{0,63}\/(operations|procedure)$/.test(req.url)
    ||/^\/bootcamp\/v1\/applications\/[a-z][a-z0-9.-]{0,63}\/operations\/[a-z][a-z0-9.-]{0,63}$/.test(req.url)
    ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/procedure-operations\/[a-z][a-z0-9.-]{0,63}$/.test(req.url)
    ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/(recipient-registration|review-chain)$/.test(req.url)
    // Only the encoded single checkpoint query reaches the existing strict parser.
    ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/recipient-registration\?checkpoint=[A-Za-z0-9%._~-]{1,768}$/.test(req.url)
    ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/decision-evidence(?:\/[a-z][a-z0-9.-]{0,63})?$/.test(req.url))
    ||req.method==='POST'&&(/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/(review-consents|recipient-registration)$/.test(req.url)||req.url==='/bootcamp/v1/applications');
   if(allowed||normalUi&&(req.method==='GET'&&req.url==='/bootcamp/v4/session'&&typeof normalUi.getSession==='function'||req.method==='GET'&&typeof normalUi.getPaymentReceipt==='function'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/payment-receipt$/.test(req.url)||(req.method==='GET'||req.method==='POST')&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/source-signature$/.test(req.url)
    ||req.method==='POST'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/source-session$/.test(req.url)
    ||req.method==='POST'&&typeof normalUi.startCertificate==='function'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/certificate-start$/.test(req.url)
    ||req.method==='POST'&&typeof normalUi.refreshActivity==='function'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/source-refresh$/.test(req.url)
    ||req.method==='POST'&&typeof normalUi.resume==='function'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/resume$/.test(req.url)
    ||req.method==='POST'&&typeof normalUi.approveReflection==='function'&&/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/reflection-approval$/.test(req.url)))return bootcamp(req,res);
   res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"BC_NOT_FOUND"}');return;
  }
  if(/^\/auth(?:\/|\?|$)/.test(req.url))return auth(req,res);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  const valid=req.socket.encrypted&&req.headers.host===expected.host&&(!req.headers.origin||req.headers.origin===expected.origin)
   &&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site'])
    ||wallets?.isDocument(req)&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document');
  if(!valid){res.writeHead(403,{'Content-Type':'application/json'});res.end('{"error":"ORIGIN"}');return;}
  if(wallets?.handle(req,res))return;
  if(req.method==='GET'&&req.url==='/__dev/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(config));return;}
  if(wallets?.config.teamFrontend&&req.url==='/team/index.html')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'");
  const path=req.url.split('?')[0],asset=assets.get(path)??(/^\/ui\/[a-zA-Z0-9/_-]*$/.test(path)?assets.get('/'):undefined);
  if(['GET','HEAD'].includes(req.method)&&asset){res.writeHead(200,{'Content-Type':asset.type});res.end(req.method==='HEAD'?undefined:asset.body);return;}
  res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"BC_NOT_FOUND"}');
 };
 const dispatch=native?createMoodleFrontDoor({policy:native.policy,rpcUrl:native.config.rpcUrl,handleC:moodleNative.handleC,
  handleA:async(req,res)=>{
   if(native.oauthReturn(req,res))return;
   if(req.url.startsWith('/clear-assets/')){
    const asset=native.assets.get(req.url);
    if(!asset){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"BC_NOT_FOUND"}');return;}
    res.writeHead(200,{'Content-Type':asset.type});res.end(asset.body);return;
   }
   return handle(req,res);
  }}):handle;
 // Configuration, inventory and immutable bytes are validated before starting any RPC listener.
 if(wallets){rpc=createProductRpc({origin:store.origin,upstream:network.rpcUrl,port:Number(expected.port)+2});
  server.once('close',()=>{void rpc.close();});}
 server.on('request',(req,res)=>{
  const task=Promise.resolve(dispatch(req,res));pending.add(task);
  task.catch(()=>{if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"BC_INTERNAL"}');}else res.destroy();})
   .finally(()=>pending.delete(task));
 });
 return {server,config,...(native?{nativeWalletConfig:native.config}:{}),ready:rpc?.ready,async drain(){await Promise.allSettled([...pending]);await rpc?.close();}};
}

// The hash-pinned owner supplies only C's reviewed inventory/handler and fixed
// course. A routes, public assets and OAuth return cannot be supplied by C or a request.
function prepareNative({options,assets,wallets,moodleLogin,origin,activityPageId}){
 const marker=assets.get('/clear-moodle-native.html');
 const fail=ok=>{if(!ok)throw Error('MOODLE_NATIVE_FRONTEND_CONFIG');};
 if(options===null){fail(!marker&&!assets.has('/clear-moodle-native-assets.html')&&moodleLogin?.native!==true);return null;}
 fail(options&&Object.keys(options).sort().join(',')==='courseId,handleC,routes'
  &&Number.isSafeInteger(options.courseId)&&options.courseId>0&&typeof options.handleC==='function'
  &&Array.isArray(options.routes)&&options.routes.every(r=>r?.owner==='C')
  &&moodleLogin?.native===true&&wallets&&!wallets.config.teamFrontend
  &&marker?.body.toString()==='<meta name="clear-moodle-native" content="1">\n');
 for(const path of ['/local/clearbridge/index.php','/local/clearbridge/configure.php'])
  fail(options.routes.some(r=>r.path===path&&r.walletDocument===true&&r.methods.join(',')==='GET'));
 fail(options.routes.some(r=>r.path==='/local/clearbridge/login_action.php'&&r.methods.join(',')==='POST'&&!r.slashArguments));
 let inventory;try{inventory=JSON.parse(assets.get('/clear-moodle-native-assets.html')?.body.toString());}catch{fail(false);}
 fail(inventory&&Object.keys(inventory).sort().join(',')==='assets,version'&&inventory.version===1
  &&Array.isArray(inventory.assets)&&inventory.assets.length>=2&&inventory.assets.length<=512);
 const publicAssets=new Map();
 for(const entry of inventory.assets){
  fail(entry&&Object.keys(entry).sort().join(',')==='path,sha256'
   &&/^\/assets\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|css)$/.test(entry.path)&&/^[a-f0-9]{64}$/.test(entry.sha256));
  const asset=assets.get(entry.path),path=entry.path.replace('/assets/','/clear-assets/');
  fail(asset&&!publicAssets.has(path)&&createHash('sha256').update(asset.body).digest('hex')===entry.sha256);
  publicAssets.set(path,asset);
 }
 fail(publicAssets.has('/clear-assets/moodle-native.js')&&publicAssets.has('/clear-assets/moodle-oauth-return.js')
  &&!publicAssets.has('/clear-assets/onboarding.js')&&!publicAssets.has('/clear-assets/operator.js'));
 const config=validateConfig({...wallets.config,surface:'MOODLE_NATIVE',redirectUri:origin+'/local/clearbridge/wallet-return'});
 const fixed=[
  ...['nonce','verify','logout','moodle-complete'].map(name=>({owner:'A',path:'/auth/'+name,methods:['POST'],query:[]})),
  {owner:'A',path:'/auth/session',methods:['GET'],query:[]},
  ...['bootstrap','redeem'].map(name=>({owner:'A',path:'/moodle/connect/'+name,methods:['POST'],query:[]})),
  {owner:'A',path:'/__dev/config',methods:['GET'],query:[]},
  {owner:'A',path:'/bootcamp/v1/applications',methods:['POST'],query:[]},
  {owner:'A',path:'/bootcamp/v4/session',methods:['GET'],query:[]},
  {owner:'A',path:'/local/clearbridge/wallet-return',methods:['GET'],query:['privy_oauth_code','privy_oauth_state','privy_oauth_provider']},
  {owner:'A',path:'/clear-assets',methods:['GET'],query:[],slashArguments:true},
  ...moodleNativeApplicationRoutes,
  ...(activityPageId===undefined?[]:[moodleActivityRefreshRoute,{owner:'C',path:'/mod/page/view.php',methods:['GET'],query:['id']}]),
 ];
 return {config,assets:publicAssets,policy:createMoodleFrontDoorPolicy({origin,activityPageId,routes:[...options.routes,...fixed]}),
  oauthReturn:createMoodleOAuthReturn({config,courseId:options.courseId})};
}
