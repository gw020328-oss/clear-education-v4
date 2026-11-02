// One disposable child per explicit self-test run. No inherited secrets or proxy env.
import {root,source,verifyPrepared} from './prepare.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {SELF_HOSTS,SELF_MODE} from '../../src/hackerrank-evidence/self-profile.mjs';
process.umask(0o077);process.env.LOG_LEVEL='silent';process.env.DISABLE_BGP_CHECKS='1';
const req=createRequire(root+'/src/ybm-collector/package.json');let server,fixture,closing=false;
async function close(){if(closing)return;closing=true;clearTimeout(timer);if(server){for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}await fixture?.close();process.disconnect?.();}
const timer=setTimeout(()=>void close(),1800000);timer.unref();
for(const s of ['SIGTERM','SIGINT','disconnect'])process.once(s,()=>void close());
try{
 verifyPrepared();if(!process.send||!['--live-hackerrank','--synthetic-https'].includes(process.argv[2])||process.argv.length!==3)throw Error('SELF_ARGUMENT');
 if(process.argv[2]==='--synthetic-https')fixture=await (await import('./synthetic-https.mjs')).startSyntheticHttps();
 const {Wallet}=req('ethers'),signer=Wallet.createRandom(),auth=Wallet.createRandom();
 process.env.PRIVATE_KEY=signer.privateKey;process.env.AUTHENTICATION_PUBLIC_KEY=auth.signingKey.publicKey;
 const {setCryptoImplementation}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls'))),{webcryptoCrypto}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls/webcrypto')));setCryptoImplementation(webcryptoCrypto);
 const sdk=await import(pathToFileURL(req.resolve('@reclaimprotocol/attestor-core')));
 process.chdir(source);const {createServer}=await import(pathToFileURL(source+'/server-review.mjs'));
 const reservation=net.createServer();await new Promise((r,j)=>{reservation.once('error',j);reservation.listen(0,'127.0.0.1',r);});const port=reservation.address().port;await new Promise(r=>reservation.close(r));server=await createServer(port);
 const profile={mode:SELF_MODE,profileId:'self-'+randomUUID(),endpoint:'ws://127.0.0.1:'+port+'/ws',signer:signer.address.toLowerCase(),sourceEnvironment:fixture?'SYNTHETIC_HTTPS':'LIVE_HACKERRANK',hosts:SELF_HOSTS,officialHostedSuccess:false,independentTrust:false,bgpCheckEnabled:false};
 // Signed authentication capability is IPC-only; no private key leaves the child.
 process.send({profile,authRequest:await sdk.createAuthRequest({hostWhitelist:SELF_HOSTS},auth.privateKey),fixtureCa:fixture?.ca??null});
}catch{process.send?.({failed:true});process.exitCode=1;await close();}
