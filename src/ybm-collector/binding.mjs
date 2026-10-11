import {randomBytes} from 'node:crypto';
import {computeAddress,SigningKey,TypedDataEncoder,verifyTypedData,getAddress,Wallet} from 'ethers';
import {digest,requireValue,exactKeys} from './values.mjs';
import {sourcePolicyHash,policyFor,MAX_ROWS} from './source-policy.mjs';

const bytes32=()=> '0x'+randomBytes(32).toString('hex');
const isHash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
export const bindingTypes={ProofSessionBindingV4:[
  {name:'applicationId',type:'bytes32'},{name:'learner',type:'address'},{name:'policyHash',type:'bytes32'},
  {name:'runtimeConfigHash',type:'bytes32'},{name:'proofSessionId',type:'bytes32'},{name:'requestNonce',type:'bytes32'},
  {name:'ownerPublicKey',type:'bytes'},{name:'expiresAt',type:'uint256'},
]};
export const instructionTypes={CollectionInstructionV4:[
  {name:'bindingHash',type:'bytes32'},{name:'sourcePolicyHash',type:'bytes32'},
  {name:'recordHash',type:'bytes32'},{name:'expiresAt',type:'uint256'},
]};
const bindingHash=record=>TypedDataEncoder.hash(record.domain,bindingTypes,record.binding);
const ownerAddress=key=>{
  requireValue(typeof key==='string'&&/^0x04[0-9a-fA-F]{128}$/.test(key),'OWNER_KEY');
  try{return computeAddress(SigningKey.computePublicKey(key,false));}catch{throw new Error('OWNER_KEY');}
};

// W02 collection diagnostics have their own EIP-712 domain. No deployed vault,
// paid enrollment, or product wallet consent is fabricated by this authority.
// Register/issue are trusted local service calls, never callback body fields.
export function createDiagnosticAuthority({signer,now=()=>Math.floor(Date.now()/1000),capacity=16}={}){
  requireValue(signer?.address&&typeof signer.signTypedData==='function','AUTHORITY_KEY_REQUIRED');
  const domain={name:'ClearCollectionDiagnostic',version:'4',chainId:431702,salt:bytes32()};
  const runtime={scope:'W02_LOCAL_TEST',dataMode:'REAL_YBM_DIAGNOSTIC',route:'DIRECT_ATTESTOR',instance:domain.salt,sourcePolicyHash,additionalTee:'DEFERRED',paymentAllowed:false};
  const runtimeConfigHash=digest(runtime),applications=new Map(),sessions=new Map(),owners=new Set();let closed=false;
  const clock=()=>{const t=now();requireValue(Number.isSafeInteger(t)&&t>0,'CLOCK');return t;};
  const get=id=>{requireValue(!closed,'AUTHORITY_CLOSED');const s=sessions.get(id);requireValue(s,'UNKNOWN_SESSION');requireValue(clock()>=s.record.createdAt&&clock()<s.record.binding.expiresAt,'SESSION_EXPIRED');return s;};
  return {
    trustedConfig:()=>structuredClone({domain,runtime,runtimeConfigHash,authorityAddress:signer.address,sourcePolicyHash}),
    registerApplication({applicationId,recipient,policyHash}){
      requireValue(!closed&&!applications.has(applicationId)&&applications.size<capacity,'APPLICATION_CAPACITY_OR_DUPLICATE');
      requireValue(isHash(applicationId)&&isHash(policyHash),'APPLICATION_SCHEMA');
      const fixedRecipient=getAddress(recipient);requireValue(fixedRecipient!=='0x0000000000000000000000000000000000000000','RECIPIENT');
      applications.set(applicationId,{fixedRecipient,policyHash});
    },
    issue({applicationId,ownerPublicKey}){
      requireValue(!closed&&sessions.size<capacity*4,'SESSION_CAPACITY');
      const app=applications.get(applicationId);requireValue(app,'UNKNOWN_APPLICATION');
      const address=ownerAddress(ownerPublicKey);requireValue(!owners.has(address),'OWNER_REUSE');
      if(app.sessionId){const previous=sessions.get(app.sessionId);requireValue(['CANCELLED','FINISHED'].includes(previous.state)||clock()>=previous.record.binding.expiresAt,'APPLICATION_BUSY');}
      const createdAt=clock(),proofSessionId=bytes32();
      const record={domain,createdAt,scope:'W02_LOCAL_TEST',fixedRecipient:app.fixedRecipient,sourcePolicyHash,runtimeConfigHash,
        sourceRequestIds:{registration:[bytes32()],score:Array.from({length:MAX_ROWS},bytes32)},
        binding:{applicationId,learner:app.fixedRecipient,policyHash:app.policyHash,runtimeConfigHash,proofSessionId,requestNonce:bytes32(),ownerPublicKey,expiresAt:createdAt+1800}};
      sessions.set(proofSessionId,{record:structuredClone(record),state:'ISSUED'});app.sessionId=proofSessionId;owners.add(address);
      return structuredClone(record);
    },
    async authorize({sessionId,walletSignature}){
      const s=get(sessionId);requireValue(s.state==='ISSUED','SESSION_STATE');
      let recipient;try{recipient=verifyTypedData(s.record.domain,bindingTypes,s.record.binding,walletSignature);}catch{throw new Error('WALLET_SIGNATURE');}
      requireValue(recipient===s.record.fixedRecipient,'WALLET_SIGNATURE');
      s.state='SIGNING';
      const instruction={bindingHash:bindingHash(s.record),sourcePolicyHash,recordHash:digest(s.record),expiresAt:s.record.binding.expiresAt};
      let signature;
      try{signature=await signer.signTypedData(domain,instructionTypes,instruction);get(sessionId);requireValue(s.state==='SIGNING','SESSION_STATE');}
      catch{if(s.state==='SIGNING')s.state='CANCELLED';throw new Error('AUTHORIZATION_INTERRUPTED');}
      s.state='AUTHORIZED';
      return structuredClone({record:s.record,walletSignature,instruction,authoritySignature:signature});
    },
    begin(sessionId){const s=get(sessionId);requireValue(s.state==='AUTHORIZED','SESSION_STATE');s.state='COLLECTING';},
    assertCollecting(sessionId){requireValue(get(sessionId).state==='COLLECTING','SESSION_STATE');},
    finish(sessionId){const s=get(sessionId);requireValue(s.state==='COLLECTING','SESSION_STATE');s.state='FINISHED';},
    cancel(sessionId){const s=sessions.get(sessionId);if(s&&!['FINISHED','CANCELLED'].includes(s.state))s.state='CANCELLED';},
    close(){closed=true;sessions.clear();applications.clear();owners.clear();},
  };
}

export function verifyInstruction(envelope,{trustedConfig,expectedRecord,ownerPublicKey,now}){
  requireValue(Buffer.byteLength(JSON.stringify(envelope))<=32768,'INSTRUCTION_SIZE');
  const e=structuredClone(envelope);
  exactKeys(e,['record','walletSignature','instruction','authoritySignature']);
  requireValue(digest(e.record)===digest(expectedRecord),'INSTRUCTION_RECORD');
  requireValue(digest(e.record.domain)===digest(trustedConfig.domain)&&e.record.runtimeConfigHash===trustedConfig.runtimeConfigHash&&e.record.binding.runtimeConfigHash===trustedConfig.runtimeConfigHash,'RUNTIME');
  requireValue(e.record.sourcePolicyHash===sourcePolicyHash&&trustedConfig.sourcePolicyHash===sourcePolicyHash,'SOURCE_POLICY');
  requireValue(Number.isSafeInteger(now)&&now>=e.record.createdAt&&now<e.record.binding.expiresAt,'SESSION_EXPIRED');
  ownerAddress(ownerPublicKey);requireValue(e.record.binding.ownerPublicKey===ownerPublicKey,'OWNER_BINDING');
  requireValue(e.record.binding.learner===e.record.fixedRecipient,'RECIPIENT');
  const expected={bindingHash:bindingHash(e.record),sourcePolicyHash,recordHash:digest(e.record),expiresAt:e.record.binding.expiresAt};
  requireValue(digest(e.instruction)===digest(expected),'INSTRUCTION_BINDING');
  try{
    requireValue(verifyTypedData(e.record.domain,bindingTypes,e.record.binding,e.walletSignature)===e.record.fixedRecipient,'WALLET_SIGNATURE');
    requireValue(verifyTypedData(trustedConfig.domain,instructionTypes,e.instruction,e.authoritySignature)===getAddress(trustedConfig.authorityAddress),'AUTHORITY_SIGNATURE');
  }catch{throw new Error('INSTRUCTION_SIGNATURE');}
  return e.record;
}

export function createBoundCollection({authority,envelope,expectedRecord,ownerPublicKey,now=()=>Math.floor(Date.now()/1000)}){
  const record=verifyInstruction(envelope,{trustedConfig:authority.trustedConfig(),expectedRecord,ownerPublicKey,now:now()});
  const sessionId=record.binding.proofSessionId;let active=false,closed=false;
  return {
    start(){requireValue(!closed&&!active,'COLLECTION_STATE');authority.begin(sessionId);active=true;},
    request(role,index=0){
      requireValue(active&&!closed,'COLLECTION_STATE');authority.assertCollecting(sessionId);
      const params=policyFor(role,index);
      return {params,context:{clearSchemaVersion:4,clearRoute:'DIRECT_ATTESTOR',clearBindingHash:bindingHash(record),clearSourceRole:role,clearSourceRequestId:record.sourceRequestIds[role][index],clearSourcePolicyHash:sourcePolicyHash},ownerAddress:ownerAddress(ownerPublicKey)};
    },
    assertActive(){requireValue(active&&!closed,'COLLECTION_STATE');authority.assertCollecting(sessionId);},
    finish(){requireValue(!closed,'COLLECTION_STATE');authority.finish(sessionId);closed=true;},
    cancel(){closed=true;authority.cancel(sessionId);},
  };
}

export async function prepareLocalDiagnostic(){
  // Explicitly approved throwaway local test recipient. All three keys remain
  // in this process; none is a funded/product wallet or sent to an attestor.
  const recipient=Wallet.createRandom(),owner=Wallet.createRandom(),signer=Wallet.createRandom();
  const authority=createDiagnosticAuthority({signer});
  const applicationId=bytes32(),policyHash=digest({purpose:'W02_COLLECTION_ONLY',scoreThreshold:800,attendanceThreshold:80,paymentAllowed:false});
  authority.registerApplication({applicationId,recipient:recipient.address,policyHash});
  const record=authority.issue({applicationId,ownerPublicKey:owner.signingKey.publicKey});
  const walletSignature=await recipient.signTypedData(record.domain,bindingTypes,record.binding);
  const envelope=await authority.authorize({sessionId:record.binding.proofSessionId,walletSignature});
  const collection=createBoundCollection({authority,envelope,expectedRecord:record,ownerPublicKey:owner.signingKey.publicKey});
  return {collection,close(){collection.cancel();authority.close();}};
}
