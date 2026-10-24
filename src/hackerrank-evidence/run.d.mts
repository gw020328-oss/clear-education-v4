import type {Buffer} from 'node:buffer';
import type {HackerRankRequest,ParticipantApproval,SubmitCandidate} from './collector.mjs';
export declare function runHackerRankCollection(session:{path:string;expiresAt:number}|null,options?:{
 trustConfig?:Readonly<Record<string,unknown>>;
 commitmentKey?:Buffer;
 issueRequest?:(input:{claimOwner:string;trustConfigHash:string;recipeHash:string;signal:AbortSignal})=>Promise<HackerRankRequest>;
 approveRequest?:(input:{request:HackerRankRequest;message:string;signal:AbortSignal})=>Promise<ParticipantApproval>;
 waitForReady?:(input:{signal:AbortSignal})=>Promise<void>;
 submit?:(input:SubmitCandidate)=>Promise<unknown>;
 signal?:AbortSignal;
}):Promise<Readonly<{status:'BLOCKED';code:'TRUST_NOT_CONFIGURED';proofVerified:false;paymentAllowed:false}>|Readonly<{
 status:'VERIFIED_CANDIDATE';condition:'MET'|'NOT_MET';receiptHash:string;proofVerified:true;paymentAllowed:false;
}>>;
