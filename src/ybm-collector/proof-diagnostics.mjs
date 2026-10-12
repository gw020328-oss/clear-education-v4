// Map errors to fixed labels. Never serialize errors, request data or stack
// strings: SDK messages can embed cookies, matched text and response bodies.
export function proofErrorCode(error){
  const message=typeof error?.message==='string'?error.message:'';
  const known=new Set(['SAME_CLIENT_REQUIRED','PROOF_CLIENT_CLOSED','NO_SIGNED_CLAIM','PROOF_VERIFICATION_FAILED','SESSION_EXPIRED','SOURCE_SECRET_MISSING','ATTESTOR_BACKPRESSURE_LIMIT','ATTESTOR_SEND_TIMEOUT','ATTESTOR_SEND_FAILED']);
  if(known.has(message))return message;
  for(const [pattern,code] of [[/request body mismatch/i,'REQUEST_BODY_MISMATCH'],[/XPath|regexp|regex|response match/i,'RESPONSE_SELECTION'],[/certificate|tls handshake/i,'TLS_VALIDATION'],[/timeout|timed out/i,'TIMEOUT'],[/fetch|ENOENT|wasm|circuit|zkey/i,'PROOF_RUNTIME_RESOURCE'],[/closed|disconnect|stream ended/i,'CONNECTION_ENDED'],[/auth parameters/i,'AUTH_PARAMETERS'],[/Provider returned error/i,'SOURCE_HTTP_ERROR']])if(pattern.test(message))return code;
  return 'PROOF_GENERATION_FAILED';
}
export function proofErrorDiagnostic(error){
  const kinds=new Set(['Error','TypeError','RangeError','AttestorError']);
  const line=typeof error?.stack==='string'?error.stack.split('\n').slice(1).join('\n').match(/@reclaimprotocol\/attestor-core\/lib\/index\.js:(\d+):\d+/)?.[1]:undefined;
  return {reason:proofErrorCode(error),kind:kinds.has(error?.name)?error.name:'OTHER',...(line?{pinnedCoreLine:Number(line)}:{}),...(error?.verificationCode?{verificationCode:verificationFailureCode({message:error.verificationCode})}:{})};
}
export const proofSteps=new Set(['connecting','sending-request-data','waiting-for-response','generating-zk-proofs','waiting-for-verification']);

const verifierCodes=new Set(['PROOF_SIZE','ATTESTOR_TRUST','RUNTIME','INSTRUCTION_SIZE','SCHEMA_KEYS','INSTRUCTION_RECORD','SOURCE_POLICY','SESSION_EXPIRED','OWNER_KEY','OWNER_BINDING','RECIPIENT','INSTRUCTION_BINDING','INSTRUCTION_SIGNATURE','EXACT_PAIR_REQUIRED','UNTRUSTED_ATTESTOR','CLAIM_SIGNATURE','CLAIM_OWNER','CLAIM_EPOCH','PROOF_TIME','SIGNED_JSON','CLAIM_IDENTIFIER','PROOF_CONTEXT','PROVIDER_HASH','EXAM_TYPE','EXAM_NUMBER','EXAM_DATE','SCORE','EXAM_JOIN']);
export function verificationFailureCode(error){return verifierCodes.has(error?.message)?error.message:'VERIFIER_REJECTED';}
