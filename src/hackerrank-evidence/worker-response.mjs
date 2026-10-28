import {parse} from 'parse5';
import {providers,isApplicationData,makeHttpResponseParser,PROVIDER_CTX,makeLogger} from '@reclaimprotocol/attestor-core';
import {parseSourceJson} from './source-json.mjs';
import {projectNestedCertificateRows} from './source-records.mjs';
import {check,canonical,isSourceId,freeze,EvidenceError} from './values.mjs';
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

function bodyOf(raw,role){
 const limit=role==='account'?1048576:65536,separator=raw.indexOf('\r\n\r\n');
 check(separator>0&&separator<=32768,'WORKER_HTTP_HEADERS');
 const lines=raw.subarray(0,separator).toString('latin1').split('\r\n');
 check(/^HTTP\/1\.1 200(?: OK)?$/.test(lines.shift()),'WORKER_HTTP_STATUS');
 const headers=new Map(),sensitive=new Set(['content-length','transfer-encoding','content-type','content-encoding','location','date']);
 for(const line of lines){
  const m=/^([!#$%&'*+.^_\x60|~0-9A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line);
  check(m,'WORKER_HTTP_HEADERS');const key=m[1].toLowerCase();
  check(!sensitive.has(key)||!headers.has(key),'WORKER_HTTP_HEADERS');headers.set(key,m[2].trim());
 }
 const type=(headers.get('content-type')??'').split(';').map(s=>s.trim());
 check(type[0].toLowerCase()===(role==='account'?'text/html':'application/json'),'WORKER_HTTP_TYPE');
 // These headers and chunk framing are disclosed by the SDK. Permit only
 // standard bounded syntax, never arbitrary header parameters/extensions.
 check(type.length<=2&&(type.length===1||/^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(type[1])),'WORKER_HTTP_ENCODING');
 if(headers.has('date'))check(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(headers.get('date')),'WORKER_HTTP_HEADERS');
 check(!headers.has('content-encoding')||headers.get('content-encoding').toLowerCase()==='identity','WORKER_HTTP_ENCODING');
 const payload=raw.subarray(separator+4),length=headers.get('content-length'),transfer=headers.get('transfer-encoding');
 check(!(length!==undefined&&transfer!==undefined),'WORKER_HTTP_FRAMING');
 let body;
 if(transfer!==undefined){
  check(transfer.toLowerCase()==='chunked','WORKER_HTTP_FRAMING');
  const chunks=[];let at=0,size=0,count=0;
  for(;;){
   check(++count<=4096,'WORKER_HTTP_LIMIT');const end=payload.indexOf('\r\n',at);
   check(end>=at&&end-at<=128,'WORKER_HTTP_FRAMING');
   const line=payload.subarray(at,end).toString('ascii');
   check(/^[0-9a-fA-F]{1,8}$/.test(line),'WORKER_HTTP_FRAMING');
   const n=Number.parseInt(line,16);at=end+2;
   if(n===0){check(at+2===payload.length&&payload.subarray(at).equals(Buffer.from('\r\n')),'WORKER_HTTP_FRAMING');break;}
   check(n<=limit-size&&at+n+2<=payload.length&&payload.subarray(at+n,at+n+2).equals(Buffer.from('\r\n')),'WORKER_HTTP_LIMIT');
   chunks.push(payload.subarray(at,at+n));size+=n;at+=n+2;
  }
  body=Buffer.concat(chunks,size);
 }else{
  if(length!==undefined)check(/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)===payload.length,'WORKER_HTTP_FRAMING');
  check(payload.length<=limit,'WORKER_HTTP_LIMIT');body=Buffer.from(payload);
 }
 return body;
}
function accountFields(text){
 let count=0,bad=false;const scripts=[];
 const tree=parse(text,{onParseError:error=>{if(error.code==='duplicate-attribute')bad=true;}});
 function visit(node,depth){
  check(++count<=100000&&depth<=64,'WORKER_HTML_LIMIT');
  if(node.tagName==='script'&&node.attrs.some(a=>a.name==='id'&&a.value==='__NEXT_DATA__'))scripts.push(node);
  for(const child of node.childNodes??[])visit(child,depth+1);
  if(node.content)visit(node.content,depth+1);
 }
 visit(tree,0);check(!bad&&scripts.length===1,'WORKER_ACCOUNT_SCRIPT');
 const script=scripts[0];check(script.attrs.some(a=>a.name==='type'&&a.value==='application/json'),'WORKER_ACCOUNT_SCRIPT');
 const data=parseSourceJson(script.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(''),{maxBytes:1048576,maxDepth:48,maxNodes:32768});
 const props=data?.props?.pageProps,direct=props?.prefetchedData?.profile?.username,queries=props?.dehydrateState?.queries;
 check(isSourceId(direct)&&Array.isArray(queries)&&queries.length<=32,'WORKER_ACCOUNT_PATH');
 const cache=queries.filter(q=>Array.isArray(q?.queryKey)&&q.queryKey.length===1&&q.queryKey[0]==='prefetchData');
 check(cache.length===1&&cache[0]?.state?.data?.profile?.username===direct,'WORKER_ACCOUNT_COPIES');
 return {username:direct};
}
function certificateFields(text,username,selection){
 const body=parseSourceJson(text);check(object(body),'WORKER_CERTIFICATE_PATH');
 const rows=projectNestedCertificateRows(body.data),ids=new Set();
 for(const row of rows){check(row.username===username,'ACCOUNT_JOIN');check(!ids.has(row.certificate_id),'CERTIFICATE_ID');ids.add(row.certificate_id);}
 const matching=rows.filter(row=>row.certificate_name==='Python (Basic)');
 check(selection!==null||matching.length<=1,'AMBIGUOUS_CERTIFICATE');
 const selected=selection===null?matching[0]:rows.find(row=>row.certificate_id===selection);
 check(selected?.certificate_name==='Python (Basic)','CERTIFICATE_CLASS_OR_SELECTION');
 check(['test_passed','test_failed'].includes(selected.status),'UNKNOWN_ISSUER_STATUS');
 return {username:selected.username,certificate_id:selected.certificate_id,status:selected.status,
  certificate_label:'Python',certificate_level:'Basic',certificate_slug:'python_basic'};
}

// Pure inspection is NOT provenance. Only worker-source can bind its result to
// that same in-flight SDK call and mint a process-local verification handle.
export async function inspectWorkerTranscript({transcript,tlsVersion,role,params,secretParams,username,selectedCertificateId,clientVersion}){
 const owned=[];let sdkParser;
 try{
  makeLogger(true,'silent');
  check(['account','certificate'].includes(role)&&['TLS1_2','TLS1_3'].includes(tlsVersion),'WORKER_TRANSCRIPT');
  check(clientVersion===PROVIDER_CTX.version,'WORKER_PROTOCOL');
  check(Array.isArray(transcript)&&transcript.length>0&&transcript.length<=8192,'WORKER_TRANSCRIPT');
  const server=[],client=[];let serverSize=0,clientSize=0;
  const limit=(role==='account'?1048576:65536)+32768;
  for(const block of transcript){
   check(block&&['client','server'].includes(block.sender)&&block.message,'WORKER_TRANSCRIPT');
   const p=block.message;if(!isApplicationData(p,tlsVersion))continue;
   check(p.plaintext instanceof Uint8Array&&p.plaintext.length>0,'WORKER_TRANSCRIPT');
   const bytes=p.plaintext.subarray(0,p.plaintext.length-(tlsVersion==='TLS1_3'?1:0));
   if(block.sender==='server'){serverSize+=bytes.length;check(serverSize<=limit,'WORKER_HTTP_LIMIT');server.push(bytes);}
   else{clientSize+=bytes.length;check(clientSize<=32768,'WORKER_REQUEST_LIMIT');client.push(bytes);}
  }
  check(serverSize>0&&clientSize>0,'WORKER_TRANSCRIPT');
  const raw=Buffer.concat(server,serverSize),actualRequest=Buffer.concat(client,clientSize);owned.push(raw,actualRequest);
  const body=bodyOf(raw,role);owned.push(body);
  sdkParser=makeHttpResponseParser();sdkParser.onChunk(raw);sdkParser.streamEnded();
  check(Buffer.from(sdkParser.res.body).equals(body),'WORKER_HTTP_INTERPRETATION');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(body);
  const fields=role==='account'?accountFields(text):certificateFields(text,username,selectedCertificateId);
  // Compare the exact request from this tunnel, then preview the SDK's own
  // redaction/extraction. Mismatching selectors fail before any proof reveal.
  const http=providers.http,request=http.createRequest(secretParams,structuredClone(params),quiet);
  const expectedRequest=Buffer.from(request.data);owned.push(expectedRequest);
  if(request.data instanceof Uint8Array)owned.push(request.data);
  check(expectedRequest.equals(actualRequest),'WORKER_REQUEST_MISMATCH');
  for(const r of request.redactions)expectedRequest.fill('*',r.fromIndex,r.toIndex);
  const revealed=Buffer.from(raw);owned.push(revealed);
  const hidden=http.getResponseRedactions({response:raw,params:structuredClone(params),logger:quiet,ctx:PROVIDER_CTX});
  for(const r of hidden){
   check(!r.hash&&Number.isSafeInteger(r.fromIndex)&&Number.isSafeInteger(r.toIndex)&&r.fromIndex>=0&&r.toIndex>=r.fromIndex&&r.toIndex<=revealed.length,'WORKER_REDACTIONS');
   revealed.fill('*',r.fromIndex,r.toIndex);
  }
  const extracted=await http.assertValidProviderReceipt({clientVersion,receipt:[{sender:'client',message:expectedRequest},{sender:'server',message:revealed}],params:structuredClone(params),logger:quiet,ctx:PROVIDER_CTX});
  check(canonical(extracted?.extractedParameters)===canonical(fields),'WORKER_EXTRACTION_MISMATCH');
  return freeze(fields);
 }catch(error){throw new EvidenceError(error instanceof EvidenceError?error.code:'WORKER_TRANSCRIPT_REJECTED');}
 finally{for(const bytes of owned)bytes.fill(0);if(sdkParser?.res.body instanceof Uint8Array)sdkParser.res.body.fill(0);}
}
