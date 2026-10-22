/** Public-registry preparation only; performs network I/O when explicitly called
 * from a locked worker. Call before browser/login; never persist as a default. */
export declare function loadManagedHackerRankTrust(options:{
 audience:string;privacyKeyId:string;signal?:AbortSignal;
}):Promise<Readonly<Record<string,unknown>>>;
/** Trusted-host assembly for already independently obtained signer addresses. */
export declare function managedWorkerTrust(options:{
 signers:readonly string[];audience:string;privacyKeyId:string;now:number;
}):Readonly<Record<string,unknown>>;
export declare const WORKER_REVIEW_REF:'clear-c2-managed-transcript-20261022';
