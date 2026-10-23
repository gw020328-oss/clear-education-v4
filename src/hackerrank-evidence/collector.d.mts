import type {SourceDiagnostics} from './diagnostics.mjs';
import type {Buffer} from 'node:buffer';
export interface HackerRankRequest {
 readonly version:'clear-hackerrank-request.1';
 readonly audience:string;
 readonly participantId:string;
 readonly participantWallet:string;
 readonly applicationId:string;
 readonly criterionId:'python-basic-certificate';
 readonly policyHash:string;
 readonly runtimeMappingHash:string;
 readonly trustConfigHash:string;
 readonly recipeHash:string;
 readonly expectedClaimOwner:string;
 readonly nonce:string;
 readonly issuedAt:number;
 readonly expiresAt:number;
 readonly selectedCertificateId:string|null;
}
export interface ParticipantApproval {readonly request:HackerRankRequest;readonly signature:string;}
export interface Candidate {
 readonly version:'clear-hackerrank-candidate.1';
 readonly status:'VERIFIED_CANDIDATE';
 readonly dataMode:'SYNTHETIC_FIXTURE'|'RECLAIM_SIGNED_RECORD';
 readonly condition:'MET'|'NOT_MET';
 readonly receiptHash:string;
 readonly validUntilExclusive:number;
 readonly sourceVersion:string;
 readonly verification:Readonly<{
  sourceStatus:'MOCK_VERIFIED'|'VERIFIED_ATTESTOR_SIGNATURES';
  participantBinding:'VERIFIED';requestBinding:'VERIFIED';integrity:'VERIFIED';freshness:'VERIFIED';
  /** Present only for the .3 managed transcript profile. */
  structureValidation?:'TRUSTED_WORKER';disclosedFieldValidation?:'ATTESTOR';independentStructureProof?:false;
 }>;
 readonly gates:{readonly productEligible:false;readonly paymentAllowed:false;readonly grant:'HOLD';readonly outbox:'HOLD';readonly independentClaim:'NO_GO';readonly productionEnabled:false};
 readonly [field:string]:unknown;
}
export interface CollectionClient {readonly isOpen:boolean;readonly isInitialised:boolean;readonly metadata:object;terminateConnection():Promise<unknown>;}
export interface CandidateLease {
 read():Candidate;
 recheck():Readonly<Record<string,unknown>>;
 isCurrent():boolean;
 dispose():void;
}
/** Checks module-private lease identity and the issuing P1 verifier's receipt identity/freshness. */
export declare function readHackerRankCollectorLease(lease:unknown):Readonly<{candidate:Candidate;binding:Readonly<Record<string,unknown>>}>;
export interface SubmitCandidate {
 readonly candidate:Candidate;
 /** Call synchronously immediately before the API's atomic current/nonce CAS. */
 readonly recheck:()=>Readonly<Record<string,unknown>>;
 /** Candidate-only handle remains usable after browser cleanup until original expiry or dispose. */
 readonly lease:CandidateLease;
 readonly signal:AbortSignal;
}
export interface CollectionInput {
 readonly envelope:ParticipantApproval;
 /** Obtain from the server's authenticated issued-request record, never envelope.request itself. */
 readonly expectedRequest:HackerRankRequest;
 readonly client:CollectionClient;
 readonly routeClient:CollectionClient;
 readonly readCookies:(input:{role:'account'|'certificate';url:string;signal:AbortSignal})=>Promise<string>;
 readonly submit:(input:SubmitCandidate)=>Promise<unknown>;
 readonly signal?:AbortSignal;
 /** Injected only for SYNTHETIC_FIXTURE offline tests; rejected in live mode. */
 readonly createClaim?:(input:Readonly<Record<string,unknown>>)=>Promise<unknown>;
}
export declare function createHackerRankCollector(input?:{
 trustConfig?:Readonly<Record<string,unknown>>;
 commitmentKey?:Buffer;
 diagnostics?:SourceDiagnostics;
 clock?:()=>number;
}):Readonly<{status:'BLOCKED';code:'TRUST_NOT_CONFIGURED';claimOwner:null}>|Readonly<{
 status:'PREPARED';claimOwner:string;close():void;collect(input:CollectionInput):Promise<Candidate>;
}>;
