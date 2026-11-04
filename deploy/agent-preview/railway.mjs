import {mkdirSync,chownSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateConfig,check} from './config.mjs';
import {openStore} from './store.mjs';
import {createService} from './service.mjs';
import {createServer} from './server.mjs';

export function railwayConfiguration(env) {
  check(env.RAILWAY_VOLUME_MOUNT_PATH==='/var/lib/clear-preview','PERSISTENT_VOLUME_REQUIRED');
  check(typeof env.CLEAR_PREVIEW_HMAC_SECRET==='string' && /^[a-f0-9]{64}$/.test(env.CLEAR_PREVIEW_HMAC_SECRET),'SECRET_FORMAT');
  return validateConfig({version:'clear-external-preview-config.1',publicOrigin:env.CLEAR_PREVIEW_PUBLIC_ORIGIN,
    port:Number(env.PORT??'8080'),institutionId:env.CLEAR_PREVIEW_INSTITUTION_ID,
    courseId:env.CLEAR_PREVIEW_COURSE_ID,operatorId:env.CLEAR_PREVIEW_OPERATOR_ID,
    dataMode:'DEMO_ACCOUNTS_ONLY',databasePath:'/var/lib/clear-preview/state/approvals.sqlite',
    // The generic profile requires this field. This runner takes the secret directly from env;
    // no private key/secret is written to this placeholder path or the image.
    sharedSecretFile:'/run/secrets/not-used-by-railway'});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  try {
    check(process.version==='v24.21.0','RUNTIME_VERSION');
    const config=railwayConfiguration(process.env),secret=process.env.CLEAR_PREVIEW_HMAC_SECRET;
    // Railway mounts volumes as root. Initialize only this service's state subdirectory,
    // then drop privileges before opening the DB, reading Gemini credentials or accepting HTTP.
    if(process.getuid()===0) {
      mkdirSync('/var/lib/clear-preview/state',{recursive:true,mode:0o700});
      chownSync('/var/lib/clear-preview/state',1000,1000);
      process.setgroups([]);process.setgid(1000);process.setuid(1000);
    }
    check(process.getuid()===1000,'RUNTIME_UID');
    const store=openStore(config.databasePath),service=createService({config,store});
    const server=createServer({config,secret,store,service});
    // Platform-internal HTTP behind Railway-managed HTTPS. No TCP proxy should be enabled.
    // Exact public Host, HMAC, Origin/Cookie rejection and bounded requests remain mandatory.
    server.listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({event:'LISTENING',port:config.port,
      platform:'RAILWAY',uid:process.getuid(),actualObservationEnabled:false,paymentAllowed:false})));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
      server.close(()=>{service.close();store.close();process.exit(0);});
      setTimeout(()=>process.exit(1),55000).unref();
    });
  } catch {console.error('PREVIEW_START_FAILED');process.exitCode=1;}
}
