import {types} from 'node:util';

// REMOTE_ERROR_HINT only: text supplied by a peer is not a verified cause or
// permission to accept a claim. Do not retain/return messages, data or signatures.
export const CLAIM_RETURN_REASON_HINTS=Object.freeze([
 'UNKNOWN','REQUEST_SIGNATURE','TIMESTAMP_WINDOW','TLS_HANDSHAKE','ZK_PROOF','TRANSCRIPT_PACKET','HTTP_PROVIDER_RECEIPT',
]);
const MAX_MESSAGE_LENGTH=2048;
const typedArrayLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const object=value=>value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value);
const own=(value,key)=>object(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const present=value=>value!==undefined&&value!==null;
const signaturePresent=value=>object(value)&&types.isUint8Array(value)&&typedArrayLength.call(value)>0;

// Audited 5.1.4 server source at bc36dac3657fc46b79b4ecd545262c32440b05a6:
// src/server/handlers/claimTunnel.ts (claimTunnel timestamp check),
// src/server/utils/assert-valid-claim-request.ts (assertValidClaimRequest and
// decryptTranscript packet wrapper), src/server/utils/process-handshake.ts
// (processHandshake and processHandshakeMessage).
// HTTP literals/templates are also in both pinned lib/index.js:7391-7596.
// ZK suffix: lib/index.js:5315-5320; zk-symmetric-crypto/lib/zk.js:56-57.
const handshakeExact=new Set([
 'incomplete TLS record encountered','Could not find cipherSuite to use & got enc record',
 'No provider certificates received','server finished message not found',
 'TLS1.3 cert verify packet not received','change cipher spec message not found','client hello has no SNI',
]);
const handshakeTemplates=[
 /^Receipt over but server finish: -?\d{1,10}, client finish: -?\d{1,10}$/,
 /^no direct reveal for handshake packet: \d{1,10}$/,
 /^Missing follow up to incomplete packet at idx: \d{1,10}$/,
];
const httpExact=new Set([
 'Response body start not found','request body mismatch',
 'Method/Host mismatch, or first 2 headers were not Host and Connection',
]);
const httpTemplates=[
 /^Expected protocol: https, found: [^\r\n]{1,128}$/,
 /^Invalid method: [A-Za-z]{1,32}$/,
 /^Expected path: [^\r\n]{1,1900}, found: [^\r\n]{1,1900}$/,
 /^Expected host: [^\r\n]{1,512}, found: [^\r\n]{1,512}$/,
 /^Connection header must be "close", got "[^\r\n]{1,512}"$/,
 /^Provider returned error \d{3}$/,
 /^Response did not start with "HTTP\/1\.1 2XX" got "[^\r\n]{0,1900}"$/,
 /^Invalid receipt\. Regex "[^\r\n]{1,1900}" (?:matched|didn't match)$/,
 /^Invalid receipt\. Response (?:contains|does not contain) "[^\r\n]{0,1900}"$/,
 /^Duplicate parameter [A-Za-z_$][A-Za-z0-9_$]{0,127}$/,
 /^Invalid response match type [A-Za-z]{1,32}$/,
 /^Too many redactions in URL path: \d{1,10}$/,
 /^Unsupported response charset "[^\r\n]{1,128}"$/,
];
function reasonHint(error){
 // ERROR_INVALID_CLAIM is numeric 5 in the pinned protobuf. Outer RPC errors
 // and string/name lookalikes are a different boundary and are not classified.
 if(own(error,'code')!==5)return 'UNKNOWN';
 const message=own(error,'message');
 if(typeof message!=='string'||message.length===0||message.length>MAX_MESSAGE_LENGTH
  ||/[\u0000-\u001f\u007f\u2028\u2029]/u.test(message))return 'UNKNOWN';
 if(message==='No signature provided on claim request'||message==='Invalid signature on claim request')return 'REQUEST_SIGNATURE';
 if(/^Timestamp provided \d{1,10} is too far off\. Current time is \d{1,10}$/.test(message))return 'TIMESTAMP_WINDOW';
 if(handshakeExact.has(message)||handshakeTemplates.some(pattern=>pattern.test(message)))return 'TLS_HANDSHAKE';
 // Match the specific verifier failure before the broader packet wrapper.
 if(/^error in handling packet at idx \d{1,10}: Error: invalid proof \(ZK proof \d{1,10}, startIdx \d{1,10}, record \d{1,10}\)$/.test(message))return 'ZK_PROOF';
 if(/^error in handling packet at idx \d{1,10}: [^\r\n]{1,1900}$/.test(message))return 'TRANSCRIPT_PACKET';
 if(httpExact.has(message)||httpTemplates.some(pattern=>pattern.test(message)))return 'HTTP_PROVIDER_RECEIPT';
 return 'UNKNOWN';
}

export function claimReturnDiagnostics(result){
 try{
  const error=own(result,'error'),claim=own(result,'claim'),signatures=own(result,'signatures');
  // error/claim presence means an own non-null data value, not valid structure.
  return Object.freeze({reasonHint:reasonHint(error),errorPresent:present(error),claimPresent:present(claim),
   // Presence is nonempty typed-array shape only, never signature validation.
   claimSignaturePresent:signaturePresent(own(signatures,'claimSignature')),
   resultSignaturePresent:signaturePresent(own(signatures,'resultSignature'))});
 }catch{
  return Object.freeze({reasonHint:'UNKNOWN',errorPresent:false,claimPresent:false,claimSignaturePresent:false,resultSignaturePresent:false});
 }
}
