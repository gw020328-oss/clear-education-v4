import type {Buffer} from 'node:buffer';
import type {HackerRankRequest,CandidateLease,CollectionInput,CollectionClient} from './collector.mjs';
export interface HackerRankSourcePins {
 readonly audience:string;
 readonly trustConfigHash:string;
 readonly recipeHash:string;
 readonly expectedClaimOwner:string;
 readonly selectedCertificateId:string|null;
 readonly dataMode:'SYNTHETIC_FIXTURE'|'RECLAIM_SIGNED_RECORD';
}
export interface PreparedHackerRankSource {
 readonly status:'PREPARED'|'BLOCKED';
 readonly code?:'TRUST_NOT_CONFIGURED';
 /** Same immutable pins before/after success; null after close/failure/trust expiry. */
 pins():HackerRankSourcePins|null;
 /** Cancels collection, releases owner and disposes any retained candidate lease. */
 close():void;
 /** Single attempt using the owner advertised by pins(). No request is issued here. */
 collectLease(expectedRequest:HackerRankRequest,options?:{
  signal?:AbortSignal;
  isAuthorized?:()=>boolean;
  signRequest?:(message:string)=>Promise<string>;
 }):Promise<CandidateLease>;
}
/** Trusted in-process managed-worker entry; transport/login are host prerequisites. */
export declare function prepareHackerRankSource(input?:{
 trustConfig?:Readonly<Record<string,unknown>>;
 commitmentKey?:Buffer;
 selectedCertificateId?:string|null;
 client?:CollectionClient;
 routeClient?:CollectionClient;
 readCookies?:CollectionInput['readCookies'];
 /** Synthetic offline tests only. */
 clock?:()=>number;
 /** Synthetic offline tests only; rejected during preparation in live mode. */
 createClaim?:CollectionInput['createClaim'];
}):PreparedHackerRankSource;
