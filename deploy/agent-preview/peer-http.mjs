import http from 'node:http';
import https from 'node:https';
import {peerPaths,preparePath} from './peer-release.mjs';

export function createPeerServer({engine,origin,tls}) {
  const expectedHost=new URL(origin).host;
  const handler=async(req,res)=>{
    const cancellation=new AbortController();
    const cancel=()=>{if(!res.writableEnded)cancellation.abort(Error('REQUEST_ABORTED'));};
    res.once('close',cancel);
    req.once('aborted',cancel);
    try {
      if(req.headers.host!==expectedHost || req.headers.origin || req.headers.cookie || req.headers['sec-fetch-site']
        || req.method!=='POST' || ![preparePath,...peerPaths].includes(req.url) || req.headers['content-type']!=='application/json'
        || req.headers['content-encoding'])throw Error('PEER_HTTP');
      let size=0;
      const chunks=[];
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>32768)throw Error('PEER_SIZE');
        chunks.push(chunk);
      }
      cancellation.signal.throwIfAborted();
      const body=await engine.handle(req.url,Buffer.concat(chunks),{signal:cancellation.signal});
      if(!res.destroyed)res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','connection':'close'}).end(body);
    } catch {
      if(!res.destroyed && !res.headersSent)res.writeHead(422,{'content-type':'application/json','cache-control':'no-store','connection':'close'})
        .end('{"code":"PEER_REJECTED","paymentAllowed":false}');
    } finally {
      res.removeListener('close',cancel);
      req.removeListener('aborted',cancel);
    }
  };
  const options={maxHeaderSize:8192,requestTimeout:5000,headersTimeout:5000};
  const server=tls?https.createServer({...options,...tls},handler):http.createServer(options,handler);
  server.maxConnections=16;
  server.setTimeout(45000,socket=>socket.destroy());
  return server;
}
