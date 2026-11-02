import type {SelfAttestorRuntime} from '../../tools/local-attestor-review/host.mjs';
import type {SourceDiagnostics} from './diagnostics.mjs';
import type {Buffer} from 'node:buffer';
import type {PreparedHackerRankSource} from './prepared-source.mjs';
/** Same-process managed worker. The callback must consume its lease before
 * returning; closing this scope invalidates the source and every retained lease.
 * The enclosing storage worker remains responsible for profile deletion. */
export declare function withManagedHackerRankSource<T>(session:{path:string;expiresAt:number}|null,options?:{
 selfAttestor?:SelfAttestorRuntime|null;
 trustConfig?:Readonly<Record<string,unknown>>;
 commitmentKey?:Buffer;
 diagnostics?:SourceDiagnostics;
 selectedCertificateId?:string|null;
 waitForReady?:(input:{signal:AbortSignal})=>Promise<void>;
 useSource?:(source:PreparedHackerRankSource,input:{signal:AbortSignal})=>Promise<T>;
 signal?:AbortSignal;
}):Promise<T|Readonly<{status:'BLOCKED';code:'TRUST_NOT_CONFIGURED';proofVerified:false;paymentAllowed:false}>>;
