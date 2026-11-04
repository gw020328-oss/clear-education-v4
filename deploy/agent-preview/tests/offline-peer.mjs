import http from 'node:http';
import {createService} from '../service.mjs';
import {check,exact} from '../config.mjs';
import {strictJson} from '../../../src/hackerrank-evidence/values.mjs';

const generate='/v1/preview/generate', result='/v1/preview/observation-result';
const zero='0'.repeat(64);
const parse=body=>strictJson(new TextDecoder('utf-8',{fatal:true}).decode(body),16384);

// Single-context fixture. The B protocol, context and key enter through trusted
// test composition. This file is excluded from the runtime artifact.
export function createOfflinePeer({protocol,pins,key,replay,context,targetRef,timePolicy,config,store,modelTransport,clock}) {
  context=Object.freeze(structuredClone(context));
  const service=createService({config,store,modelTransport,clock:()=>clock()*1000,offlinePeerContext:context});
  const routes=new Map(pins.map(pin=>[pin.path,protocol.validatePeerPin(pin)]));
  check(routes.size===2 && routes.has(generate) && routes.has(result),'FIXTURE_ROUTES');
  for(const pin of routes.values()) {
    check(pin.origin==='https://127.0.0.1' && pin.deploymentEpoch===config.deploymentEpoch
      && pin.maxClockSkewSeconds===timePolicy.maxClockSkewSeconds,'FIXTURE_PIN');
  }
  let draft=null,reviewed=false,delivered=false,closed=false,active=false;
  const server=http.createServer(async(req,res)=>{
    const controller=new AbortController();
    res.once('close',()=>controller.abort());
    let entered=false;
    try {
      const pin=routes.get(req.url);
      check(!closed && !active && pin && req.method==='POST','FIXTURE_ROUTE');
      active=true;
      entered=true;
      check(req.socket.remoteAddress==='127.0.0.1' && req.headers.host==='127.0.0.1'
        && req.headers['content-type']==='application/json' && !req.headers['content-encoding']
        && !req.headers.cookie && !req.headers.origin && !req.headers['sec-fetch-site'],'FIXTURE_HTTP');
      let size=0;
      const chunks=[];
      for await(const chunk of req) {
        size+=chunk.length;
        check(size<=32768,'FIXTURE_SIZE');
        chunks.push(chunk);
      }
      controller.signal.throwIfAborted();
      check(!closed,'FIXTURE_CLOSED');
      const request=protocol.acceptPeerRequest({wire:Buffer.concat(chunks),key,pin,replay});
      const {meta}=request;
      check(meta.contextRef===context.previewContextRef && meta.sourceHash===context.sourceHash
        && meta.expiresAtExclusive<=context.expiresAtExclusive,'FIXTURE_CONTEXT');
      const value=parse(request.body);
      let output,observationExpiry=Infinity;
      if(req.url===generate) {
        exact(value,['sourceText','approvalRef']);
        check(!draft && meta.proposalHash===zero,'FIXTURE_DRAFT');
        const deadline=(meta.expiresAtExclusive-pin.maxClockSkewSeconds)*1000;
        const generated=await service.generate({institutionId:config.institutionId,courseId:config.courseId,
          operatorId:config.operatorId,...value},{signal:controller.signal,offlinePeerDeadline:deadline});
        output=generated.peerDraft;
      } else {
        check(draft && reviewed && !delivered && meta.proposalHash===draft.proposalHash,'FIXTURE_REVIEW');
        exact(value,['targetRef','status','observedAt']);
        check(value.targetRef===targetRef && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.targetRef)
          && ['COMPLETE','INCOMPLETE','UNKNOWN','INACCESSIBLE'].includes(value.status)
          && Number.isSafeInteger(value.observedAt) && value.observedAt>0 && value.observedAt<=clock(),'FIXTURE_OBSERVATION');
        observationExpiry=value.observedAt+timePolicy.maxObservationAgeSeconds-pin.maxClockSkewSeconds;
        check(meta.expiresAtExclusive<=observationExpiry && clock()<observationExpiry,'FIXTURE_OBSERVATION_EXPIRED');
        output={version:'clear-offline-observation-receipt.1',observation:value,
          provenance:'OFFLINE_TEST',automaticEligibility:false,paymentAllowed:false};
      }
      controller.signal.throwIfAborted();
      check(!closed && clock()<meta.expiresAtExclusive-pin.maxClockSkewSeconds,'FIXTURE_EXPIRED');
      const response=protocol.encodePeerResponse({request,body:Buffer.from(JSON.stringify(output)),key,pin,
        now:clock(),expiresAtExclusive:Math.min(context.expiresAtExclusive,observationExpiry)});
      if(req.url===generate) draft=output.input;
      else delivered=true;
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','connection':'close'}).end(response);
    } catch {
      if(!res.destroyed && !res.headersSent) res.writeHead(422,{'content-type':'application/json','connection':'close'})
        .end('{"code":"OFFLINE_PEER_REJECTED","paymentAllowed":false}');
    } finally {
      if(entered)active=false;
    }
  });
  server.setTimeout(5000,socket=>socket.destroy());
  return {
    async listen() {
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      return server.address().port;
    },
    // Harness calls this only after B has accepted the AST and reviewed it under
    // the current authenticated student. No review route is exposed here.
    confirmReview({previewContextRef,draftId,proposalHash}) {
      check(!closed && clock()<context.expiresAtExclusive && draft && previewContextRef===context.previewContextRef
        && draftId===draft.draftId && proposalHash===draft.proposalHash,'FIXTURE_REVIEW');
      reviewed=true;
    },
    close() {
      closed=true;
      draft=null;
      service.close();
      return new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    }
  };
}
