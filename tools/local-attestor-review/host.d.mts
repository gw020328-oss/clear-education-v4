import type {SelfAttestorProfile} from '../../src/hackerrank-evidence/self-profile.mjs';
import type {CollectionClient} from '../../src/hackerrank-evidence/collector.mjs';
/** Only startSelfAttestorTest can mint a runtime accepted by the managed source. */
export interface SelfAttestorRuntime {
 readonly profile:SelfAttestorProfile;
 isCurrent():boolean;
 trust(options:{audience:string;privacyKeyId:string}):Readonly<Record<string,unknown>>;
 openClient(options?:{signal?:AbortSignal}):Promise<{client:CollectionClient;close():Promise<void>}>;
 close():Promise<void>;
}
export declare function assertSelfRuntime(runtime:unknown,profile:SelfAttestorProfile):void;
/** Locked worker only. syntheticHttps is exclusively an explicit rehearsal in a disposable process. */
export declare function startSelfAttestorTest(options?:{signal?:AbortSignal;syntheticHttps?:boolean}):Promise<SelfAttestorRuntime>;
