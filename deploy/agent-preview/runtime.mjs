import {openStore} from './store.mjs';
import {createService} from './service.mjs';
import {createServer} from './http-server.mjs';

// Runs only after source verification (and Railway privilege drop).
export function startServer({config,secret,host,platform}) {
  const store=openStore(config.databasePath),service=createService({config,store});
  const server=createServer({config,secret,store,service});
  server.listen(config.port,host,()=>console.log(JSON.stringify({event:'LISTENING',port:config.port,
    scope:'PRECONFIGURATION_ONLY',platform,uid:process.getuid?.(),actualObservationEnabled:false,paymentAllowed:false})));
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
    if(stopping)return;stopping=true;
    // Abort pending work now, before waiting for HTTP connections to drain.
    service.close();
    server.close(()=>{store.close();process.exit(0);});
    server.closeAllConnections();
    setTimeout(()=>process.exit(1),5000).unref();
  });
  return server;
}
