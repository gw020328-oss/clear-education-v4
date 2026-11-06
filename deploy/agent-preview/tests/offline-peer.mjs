import https from 'node:https';
import {createService} from '../service.mjs';
import {check,exact} from '../config.mjs';
import {strictJson} from '../../../src/hackerrank-evidence/values.mjs';

const generate='/v1/preview/generate', review='/v1/preview/execute', result='/v1/preview/observation-result';
const zero='0'.repeat(64);
const parse=body=>strictJson(new TextDecoder('utf-8',{fatal:true}).decode(body),16384);

// Single-context fixture. The B protocol, context and key enter through trusted
// test composition. This file is excluded from the runtime artifact.
export function createOfflinePeer({tls,protocol,key,replay,context,targetRef,timePolicy,config,store,modelTransport,clock}) {
  context=Object.freeze(structuredClone(context));
  const service=createService({config,store,modelTransport,clock:()=>clock()*1000,offlinePeerContext:context});
  let routes=null;
  let draft=null,reviewed=false,delivered=false,closed=false,active=false;
  const server=https.createServer(tls,async(req,res)=>{
    const controller=new AbortController();
    res.once('close',()=>controller.abort());
    let entered=false;
    try {
      const pin=routes?.get(req.url);
      check(!closed && !active && pin && req.method==='POST','FIXTURE_ROUTE');
      active=true;
      entered=true;
      check(req.socket.remoteAddress==='127.0.0.1' && req.headers.host===new URL(pin.origin).host
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
      } else if(req.url===review) {
        exact(value,['draftId','proposalHash']);
        check(draft && !reviewed && meta.proposalHash!==zero && meta.proposalHash===draft.proposalHash
          && value.proposalHash===draft.proposalHash && value.draftId===draft.draftId,'FIXTURE_REVIEW');
        output={version:'clear-offline-review-receipt.1',draftId:draft.draftId,
          proposalHash:draft.proposalHash,reviewed:true,paymentAllowed:false};
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
      // No state transition on expired requests or response-encoding failure.
      controller.signal.throwIfAborted();
      check(!closed && clock()<meta.expiresAtExclusive-pin.maxClockSkewSeconds,'FIXTURE_EXPIRED');
      if(req.url===generate) draft=output.input;
      else if(req.url===review) reviewed=true;
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
    configurePins(pins) {
      const address=server.address();
      check(!closed && !routes && address?.address==='127.0.0.1','FIXTURE_PIN');
      const fixed=new Map(pins.map(pin=>[pin.path,protocol.validatePeerPin(pin)]));
      check(pins.length===3 && fixed.size===3 && [generate,review,result].every(path=>fixed.has(path)),'FIXTURE_ROUTES');
      const identity=fixed.get(generate);
      for(const pin of fixed.values()) {
        check(pin.origin===`https://127.0.0.1:${address.port}` && pin.deploymentEpoch===config.deploymentEpoch
          && pin.maxClockSkewSeconds===timePolicy.maxClockSkewSeconds
          && ['sender','receiver','audience','keyRef'].every(field=>pin[field]===identity[field]),'FIXTURE_PIN');
      }
      routes=fixed;
    },
    close() {
      closed=true;
      draft=null;
      service.close();
      return new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    }
  };
}
